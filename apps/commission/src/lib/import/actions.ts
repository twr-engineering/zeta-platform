"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { checkConfirmation } from "@/lib/friction/gate";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import {
  consumeReceivableEvents,
  consumeReceivablePaymentEvents,
} from "@/lib/receivables/consume";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";
import type { Json } from "@/types/database";
import { parseWorkbook } from "./parse";
import { buildImportPlan } from "./build";
import { sha256Hex } from "./hash";
import { IMPORT_CONFIRM_PHRASE, IMPORT_INTENT_FIELD } from "./constants";
import type { ImportPlan } from "./types";

/**
 * M1.4 — the importer's write path (FR-M1-10). Two server actions over the SAME
 * uploaded file:
 *
 *   dryRunImport — parse + compute + reconcile, render the summary, WRITE NOTHING.
 *   runImport    — re-parse + re-reconcile SERVER-SIDE (never trust the preview),
 *                  gate on the typed confirmation, then run_workbook_import writes
 *                  every leg in ONE transaction.
 *
 * The real run is refused if reconciliation finds ANY mismatch (a disagreeing row
 * is reported, not imported — FR-M1-10) or if the file was already imported / the
 * workspace already has deals (idempotency, run_workbook_import guards).
 */

const FILE_FIELD = "workbook";
const MAX_BYTES = 8 * 1024 * 1024; // generous; the real v30.20 file is ~0.7 MB

export type ImportActionState = ActionState & {
  /** The dry-run preview, or the plan that was imported. */
  plan?: ImportPlan;
  /** True once the real import has committed. */
  done?: boolean;
  /** The committed import's server-side counts (next deal code, per-leg totals). */
  result?: {
    deals: number;
    payments: number;
    overlays: number;
    next_deal_code: string;
  };
};

type RunResult = {
  ok: boolean;
  reason?: "already_imported" | "workspace_not_empty";
  batch_id?: string;
  summary?: {
    deals_created?: number;
    payments_created?: number;
    overlays_applied?: number;
    next_deal_code?: string;
  };
};

function notConfigured(): ImportActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

async function readUpload(
  formData: FormData
): Promise<{ ok: true; bytes: Uint8Array; name: string | null } | { ok: false; error: string }> {
  const file = formData.get(FILE_FIELD);
  if (!file || typeof file === "string") {
    return { ok: false, error: "Choose a v30.x ZETA workbook (.xlsx) to import." };
  }
  const blob = file as File;
  if (blob.size === 0) return { ok: false, error: "That file is empty." };
  if (blob.size > MAX_BYTES) {
    return { ok: false, error: "That file is larger than the 8 MB import limit." };
  }
  const name = typeof blob.name === "string" && blob.name !== "" ? blob.name : null;
  if (name && !name.toLowerCase().endsWith(".xlsx")) {
    return {
      ok: false,
      error: "The importer reads .xlsx workbooks — export your ZETA sheet to Excel first.",
    };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { ok: true, bytes, name };
}

async function planFromUpload(
  formData: FormData
): Promise<{ ok: true; plan: ImportPlan } | { ok: false; error: string }> {
  const upload = await readUpload(formData);
  if (!upload.ok) return upload;
  try {
    const workbook = await parseWorkbook(upload.bytes);
    const plan = buildImportPlan(workbook, sha256Hex(upload.bytes), upload.name);
    return { ok: true, plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that workbook.";
    return { ok: false, error: message };
  }
}

// --- dry run (FR-M1-10, first-class) ----------------------------------------

export async function dryRunImport(
  _prev: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  const result = await planFromUpload(formData);
  if (!result.ok) return { error: result.error };

  return {
    error: null,
    message: "Dry run complete — nothing was imported yet. Review the summary below.",
    plan: result.plan,
  };
}

// --- real run (typed confirmation + reconciliation gate + one transaction) ---

export async function runImport(
  _prev: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  const confirmation = checkConfirmation(formData, {
    mode: "typed",
    phrase: IMPORT_CONFIRM_PHRASE,
  });
  if (!confirmation.ok) return { error: confirmation.error };

  // Re-parse and re-reconcile SERVER-SIDE — the preview is never trusted.
  const built = await planFromUpload(formData);
  if (!built.ok) return { error: built.error };
  const plan = built.plan;

  if (plan.mismatches.length > 0) {
    return {
      error: `${plan.mismatches.length} recomputed ${
        plan.mismatches.length === 1 ? "figure" : "figures"
      } disagree with the workbook by more than ₱0.01. Nothing was imported — the disagreeing rows are listed below.`,
      plan,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_workbook_import", {
    p_payload: plan.payload as unknown as Json,
  });

  if (error) return { error: `Could not import the workbook: ${error.message}`, plan };

  const run = data as unknown as RunResult;
  if (!run?.ok) {
    if (run?.reason === "already_imported") {
      return {
        error:
          "This exact workbook has already been imported into this workspace. Re-importing the same file is a no-op.",
        plan,
      };
    }
    if (run?.reason === "workspace_not_empty") {
      return {
        error:
          "This workspace already has deals. The importer preserves the workbook's codes, so it only runs on a fresh workspace.",
        plan,
      };
    }
    return { error: "Could not import the workbook. Reload and try again.", plan };
  }

  // The deal→receivable projection ran inside the import transaction; this is a
  // belt-and-braces drain in case any event is still pending.
  await consumeReceivableEvents().catch(() => {});
  // M4.2 — drain the payment events the import emitted (the 8 workbook releases) so
  // each receivable's collected/balance/dates reflect the imported cash. The deal
  // consumer set balance = total_collectible − 0 for every row; this restates the
  // paid ones. The cursor started at zero, so this is the first drain of these events.
  await consumeReceivablePaymentEvents().catch(() => {});

  revalidatePath(ROUTES.deals);
  revalidatePath(ROUTES.collectibles);
  revalidatePath(ROUTES.payments);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.settingsPropertyTypes);
  revalidatePath(ROUTES.settingsDevelopers);
  revalidatePath(ROUTES.settingsLeadSources);
  revalidatePath(ROUTES.settingsAuditLog);
  // NOT revalidating ROUTES.dealImport on purpose: this IS the current route, and
  // refreshing it would swap the client wizard's just-earned success panel for the
  // server "already imported" state. The wizard's local `done` shows the outcome;
  // the next visit reads the blocked state fresh.

  return successState(run, plan);
}

function successState(run: RunResult, plan: ImportPlan): ImportActionState {
  return {
    error: null,
    message: `Imported ${run.summary?.deals_created ?? plan.counts.deals} deals, ${
      run.summary?.payments_created ?? plan.counts.payments
    } payments and ${run.summary?.overlays_applied ?? plan.counts.overlays} collectible states. Your next new deal will be ${
      run.summary?.next_deal_code ?? plan.counts.next_deal_code
    }.`,
    plan,
    done: true,
    result: {
      deals: run.summary?.deals_created ?? plan.counts.deals,
      payments: run.summary?.payments_created ?? plan.counts.payments,
      overlays: run.summary?.overlays_applied ?? plan.counts.overlays,
      next_deal_code: run.summary?.next_deal_code ?? plan.counts.next_deal_code,
    },
  };
}

// --- one form, two actions (the wizard's Preview vs Import buttons) ----------

/**
 * The wizard submits ONE form (carrying the file) to this dispatcher, routing to
 * the dry run or the real import by the `intent` field the pressed button sets.
 * Keeping it one form is what lets both submits carry the same uploaded file
 * without re-selecting it.
 */
export async function importAction(
  prev: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  return formData.get(IMPORT_INTENT_FIELD) === "run"
    ? runImport(prev, formData)
    : dryRunImport(prev, formData);
}
