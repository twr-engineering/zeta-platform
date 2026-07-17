"use server";

import { revalidatePath } from "next/cache";

import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { createClient } from "@/lib/supabase/server";
import { TAX_SETTINGS_SELECT } from "@/lib/supabase/selects";
import { ROUTES } from "@/lib/routes";
import { dealTypeToEngine, dealDerivedDbFields } from "@/lib/deals/map";
import { consumeReceivableEvents } from "@/lib/receivables/consume";
import type { RecomputeProgress, RecomputeStatus } from "./recompute";

/**
 * The bulk recompute runner (FR-M1-07) — the consumer M0.2's queue was built
 * for. It drives a settings_change_event to a fully-restated set of deals
 * through the M1.1 engine and the single-writer DB functions (start / next /
 * apply / complete_recompute_job in the M1.5 migration).
 *
 * MONOLITH-FIRST (Master PRD §6). No external queue: the app drives batches
 * itself and the recompute_job row is the durable state between them. The engine
 * runs HERE (FR-M1-05) — computeDeal per deal — and the DB is the single writer,
 * exactly as create_deal/update_deal are for a single edit.
 *
 * RESUMABLE + RETRY-SAFE. A batch either commits (the job cursor advances) or
 * rolls back (it does not), so re-running drains from the last committed cursor;
 * a deal already at its correct figures diffs to nothing and is skipped. The
 * event is consumed exactly once (the M0.2 trigger enforces it), so a double
 * drain cannot double-restate.
 */

// Big enough that 1,000 deals is ~5 round trips (well inside the <30s budget),
// small enough that one batch's jsonb payload stays modest.
const BATCH_SIZE = 200;

// A generous ceiling so a runaway loop can never spin forever; far above any
// real workspace (this is 100k deals at the batch size). Reaching it leaves the
// job resumable rather than erroring.
const MAX_BATCHES = 500;

/** A row of next_recompute_deals — engine inputs + resolved refs, money ::text. */
type RecomputeDealRow = {
  id: string;
  version: number;
  deal_type: "developer" | "resale" | "n_a";
  transaction_type: DealComputeInput["transaction_type"];
  representation: DealComputeInput["representation"];
  force_vat: boolean;
  receipt_issued: boolean;
  commission_basis: "percent" | "fixed";
  list_price: string;
  rate_pct: string | null;
  fixed_amount: string | null;
  incentive_billed: string;
  incentive_taxable: "yes" | "no" | null;
  referral_out_pct: string;
  referral_out_fixed: string;
  property_vat_rule: DealComputeInput["property_vat_rule"];
  developer_comm_base: "gross" | "net" | null;
};

type DealClient = Awaited<ReturnType<typeof createClient>>;

/** Read the CURRENT tax settings straight from the row (post-change, no cache). */
async function freshEngineSettings(supabase: DealClient): Promise<EngineSettings | null> {
  const { data, error } = await supabase
    .from("tax_settings")
    .select(TAX_SETTINGS_SELECT)
    .maybeSingle<{
      vat_rate: string;
      ewt_rate: string;
      property_vat_threshold: string;
      vat_registered: boolean;
    }>();

  if (error || !data) return null;
  return {
    vat_rate: data.vat_rate,
    ewt_rate: data.ewt_rate,
    property_vat_threshold: data.property_vat_threshold,
    vat_registered: data.vat_registered,
  };
}

/** One recompute row → the engine's input (the n_a↔n/a bridge lives in map.ts). */
function toComputeInput(row: RecomputeDealRow): DealComputeInput {
  return {
    deal_type: dealTypeToEngine(row.deal_type),
    transaction_type: row.transaction_type,
    representation: row.representation,
    force_vat: row.force_vat,
    property_vat_rule: row.property_vat_rule,
    list_price: row.list_price,
    commission:
      row.commission_basis === "percent"
        ? { basis: "percent", rate: row.rate_pct ?? "0" }
        : { basis: "fixed", amount: row.fixed_amount ?? "0" },
    developer_comm_base: row.developer_comm_base,
    receipt_issued: row.receipt_issued,
    incentive_billed: row.incentive_billed,
    incentive_taxable: row.incentive_taxable,
    referral_out_pct: row.referral_out_pct,
    referral_out_fixed: row.referral_out_fixed,
  };
}

/**
 * Process ONE batch: fetch the next affected deals after the cursor, run the
 * engine over each, and hand the results to apply_recompute_batch (the single
 * writer). Returns whether the batch was empty — the drain's termination signal.
 */
async function stepOnce(
  supabase: DealClient,
  jobId: string,
  settings: EngineSettings
): Promise<{ empty: boolean; progress: RecomputeProgress }> {
  const { data: rowsRaw, error: fetchError } = await supabase.rpc("next_recompute_deals", {
    p_job_id: jobId,
    p_limit: BATCH_SIZE,
  });
  if (fetchError) throw new Error(`Could not read the next recompute batch: ${fetchError.message}`);

  const rows = (rowsRaw ?? []) as unknown as RecomputeDealRow[];
  if (rows.length === 0) {
    return { empty: true, progress: await readProgress(supabase, jobId) };
  }

  const results = rows.map((row) => {
    const derived = computeDeal(toComputeInput(row), settings);
    return {
      id: row.id,
      expected_version: row.version,
      ...dealDerivedDbFields(derived),
    };
  });

  const { data: applied, error: applyError } = await supabase.rpc("apply_recompute_batch", {
    p_job_id: jobId,
    p_results: results,
  });
  if (applyError) throw new Error(`Could not persist the recompute batch: ${applyError.message}`);

  const a = applied as unknown as { processed: number; restated: number; total: number };
  return {
    empty: false,
    progress: {
      jobId,
      status: "running",
      total: a.total,
      processed: a.processed,
      restated: a.restated,
      done: false,
    },
  };
}

/** The recompute_job row as progress. */
async function readProgress(supabase: DealClient, jobId: string): Promise<RecomputeProgress> {
  const { data, error } = await supabase
    .from("recompute_job")
    .select("id,status,total_deals,processed_deals,restated_deals")
    .eq("id", jobId)
    .maybeSingle<{
      id: string;
      status: RecomputeStatus;
      total_deals: number;
      processed_deals: number;
      restated_deals: number;
    }>();

  if (error || !data) {
    throw new Error(`Could not read the recompute job: ${error?.message ?? "not found"}`);
  }
  return {
    jobId: data.id,
    status: data.status,
    total: data.total_deals,
    processed: data.processed_deals,
    restated: data.restated_deals,
    done: data.status === "completed",
  };
}

/**
 * Refresh the read models a restatement moved (deal figures + their audit trail),
 * AND project the bulk deal.updated events onto their receivables (M4.1 FR-M4-02:
 * booked moves when NET GCI moves, including recompute-driven updates). Best-effort
 * on the sync — the events persist, so the cursor heals any miss on the next call.
 */
async function revalidateRestated(): Promise<void> {
  try {
    await consumeReceivableEvents();
  } catch (error) {
    console.error("receivable sync after recompute failed:", error);
  }
  revalidatePath(ROUTES.deals);
  revalidatePath(ROUTES.collectibles);
  revalidatePath(ROUTES.settingsAuditLog);
}

/**
 * Drain a job to completion, one batch at a time. Stops when a batch comes back
 * empty (every affected deal processed) and stamps the event consumed exactly
 * once. On an unexpected error the job is marked failed but stays resumable —
 * the event is NOT consumed, so the recompute banner (or a re-save) finishes it.
 */
async function drain(
  supabase: DealClient,
  jobId: string
): Promise<RecomputeProgress> {
  const settings = await freshEngineSettings(supabase);
  if (!settings) {
    await supabase.rpc("fail_recompute_job", {
      p_job_id: jobId,
      p_error: "tax settings unavailable",
    });
    return { ...(await readProgress(supabase, jobId)), status: "failed" };
  }

  try {
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const { empty } = await stepOnce(supabase, jobId, settings);
      if (empty) {
        const { data } = await supabase.rpc("complete_recompute_job", { p_job_id: jobId });
        const done = data as unknown as { restated: number; total: number; processed: number };
        await revalidateRestated();
        return {
          jobId,
          status: "completed",
          total: done?.total ?? 0,
          processed: done?.processed ?? 0,
          restated: done?.restated ?? 0,
          done: true,
        };
      }
    }
    // Hit the safety ceiling without draining — leave it resumable.
    await revalidateRestated();
    return await readProgress(supabase, jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "recompute failed";
    await supabase.rpc("fail_recompute_job", { p_job_id: jobId, p_error: message });
    await revalidateRestated();
    return { ...(await readProgress(supabase, jobId)), status: "failed" };
  }
}

/**
 * Start (or resume) the recompute for a settings_change_event and drain it to
 * completion. Called by the settings/list actions right after a confirmed
 * restating change. Idempotent: an already-consumed event returns immediately.
 */
export async function kickoffRecompute(eventId: string): Promise<RecomputeProgress> {
  const supabase = await createClient();

  const { data: startedRaw, error } = await supabase.rpc("start_recompute_job", {
    p_event_id: eventId,
  });
  if (error) throw new Error(`Could not start the recompute: ${error.message}`);

  const started = startedRaw as unknown as {
    ok: boolean;
    status: string;
    job_id?: string;
    total?: number;
    processed?: number;
    restated?: number;
  };

  // The event was already fully consumed — nothing to do.
  if (started.status === "already_consumed" || !started.job_id) {
    return { jobId: "", status: "completed", total: 0, processed: 0, restated: 0, done: true };
  }
  if (started.status === "completed") {
    return {
      jobId: started.job_id,
      status: "completed",
      total: started.total ?? 0,
      processed: started.processed ?? 0,
      restated: started.restated ?? 0,
      done: true,
    };
  }

  return drain(supabase, started.job_id);
}

/**
 * Advance a job by ONE batch and return progress — the increment the recompute
 * banner calls in a loop so the agent sees the bar move. Completes (and consumes
 * the event) when the batch comes back empty.
 */
export async function stepRecompute(jobId: string): Promise<RecomputeProgress> {
  const supabase = await createClient();
  const settings = await freshEngineSettings(supabase);
  if (!settings) throw new Error("tax settings unavailable");

  const { empty } = await stepOnce(supabase, jobId, settings);
  if (!empty) return readProgress(supabase, jobId);

  const { data } = await supabase.rpc("complete_recompute_job", { p_job_id: jobId });
  const done = data as unknown as { restated: number; total: number; processed: number };
  await revalidateRestated();
  return {
    jobId,
    status: "completed",
    total: done?.total ?? 0,
    processed: done?.processed ?? 0,
    restated: done?.restated ?? 0,
    done: true,
  };
}

/**
 * The outstanding recompute work for the caller's workspace: a job for every
 * pending settings_change_event (started if it never was), oldest first. The
 * banner reads this to show what is left and offer "resume". RLS scopes it.
 */
export async function pendingRecomputeJobs(): Promise<RecomputeProgress[]> {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("settings_change_event")
    .select("id")
    .is("consumed_at", null)
    .order("occurred_at", { ascending: true })
    .returns<{ id: string }[]>();

  if (error) throw new Error(`Could not read pending recomputes: ${error.message}`);

  const out: RecomputeProgress[] = [];
  for (const event of events ?? []) {
    const { data: startedRaw } = await supabase.rpc("start_recompute_job", { p_event_id: event.id });
    const started = startedRaw as unknown as {
      status: string;
      job_id?: string;
      total?: number;
      processed?: number;
      restated?: number;
    };
    if (!started?.job_id) continue;
    out.push({
      jobId: started.job_id,
      status: (started.status as RecomputeStatus) ?? "pending",
      total: started.total ?? 0,
      processed: started.processed ?? 0,
      restated: started.restated ?? 0,
      done: false,
    });
  }
  return out;
}

/**
 * Drain every pending recompute for the workspace to completion. The "resume"
 * the banner offers, and the entry point tests and CI use to force the queue
 * empty. Returns the final progress of each.
 */
export async function resumePendingRecomputes(): Promise<RecomputeProgress[]> {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("settings_change_event")
    .select("id")
    .is("consumed_at", null)
    .order("occurred_at", { ascending: true })
    .returns<{ id: string }[]>();

  if (error) throw new Error(`Could not read pending recomputes: ${error.message}`);

  const out: RecomputeProgress[] = [];
  for (const event of events ?? []) {
    out.push(await kickoffRecompute(event.id));
  }
  return out;
}
