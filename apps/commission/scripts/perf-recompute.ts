/**
 * M1.5 — the live perf harness (FR-M1-07, M1 PRD §8).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-recompute.ts [N]
 *   pnpm run perf:recompute
 *
 * Seeds N synthetic deals (default 1,000) into a THROWAWAY workspace, then
 * measures the three DB-bound perf targets against a real project and reports
 * the numbers:
 *
 *   - deal-list query          P95 < 500 ms
 *   - single-deal compute      < 10 ms   (engine, sanity)
 *   - bulk recompute of N deals < 30 s   (the whole read → engine → write drain)
 *
 * The fixtures are NEVER committed: this script creates a throwaway auth user
 * (its own workspace via the signup bootstrap), inserts the deals with the
 * service role, runs the measurements as that user with a real JWT, and deletes
 * the user at the end — the orphan reaper takes the workspace and every deal /
 * event / job with it, back to baseline.
 *
 * CI-safe: with placeholder credentials it prints "skipped" and exits 0, so the
 * workflow can call it unconditionally (the engine-side budget is proven by
 * tests/unit/perf.test.ts, which runs with no database at all).
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealTypeToEngine, dealDerivedDbFields } from "@/lib/deals/map";
import { DEAL_SELECT } from "@/lib/supabase/selects";

const N = Number(process.argv[2] ?? 1000);
const PERF_EMAIL = "perf-recompute@solo.test";
const PERF_PASSWORD = "zeta-perf-password";

// Targets (M1 PRD §8).
const LIST_P95_MS = 500;
const SINGLE_COMPUTE_MS = 10;
const BULK_MS = 30_000;

function loadEnv(): Record<string, string> {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

type Ref = { propertyTypeId: string; developerId: string; leadSourceId: string };

/** N varied engine inputs — a realistic mix of taxable / untaxed deals. */
function syntheticInputs(count: number): DealComputeInput[] {
  const out: DealComputeInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = i % 5;
    const listPrice = (2_000_000 + (i % 60) * 125_000).toFixed(2);
    if (kind <= 1) {
      out.push({
        deal_type: "developer",
        transaction_type: "sale",
        representation: "seller",
        force_vat: i % 9 === 0,
        property_vat_rule: i % 2 === 0 ? "threshold" : "always_vat",
        list_price: listPrice,
        commission: { basis: "percent", rate: "0.05" },
        developer_comm_base: i % 2 === 0 ? "net" : "gross",
        receipt_issued: true,
        incentive_billed: (i % 3 === 0 ? 50_000 : 0).toFixed(2),
        incentive_taxable: i % 3 === 0 ? "yes" : null,
        referral_out_pct: "0",
        referral_out_fixed: (i % 4 === 0 ? 10_000 : 0).toFixed(2),
      });
    } else if (kind === 2) {
      out.push({
        deal_type: "resale",
        transaction_type: "sale",
        representation: "buyer",
        force_vat: false,
        property_vat_rule: "always_exempt",
        list_price: listPrice,
        commission: { basis: "fixed", amount: "200000.00" },
        developer_comm_base: null,
        receipt_issued: true,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0.02",
        referral_out_fixed: "0.00",
      });
    } else if (kind === 3) {
      out.push({
        deal_type: "resale",
        transaction_type: "sale",
        representation: "double_ended",
        force_vat: false,
        property_vat_rule: "threshold",
        list_price: listPrice,
        commission: { basis: "percent", rate: "0.03" },
        developer_comm_base: null,
        receipt_issued: false,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0",
        referral_out_fixed: "0.00",
      });
    } else {
      out.push({
        deal_type: "n/a",
        transaction_type: "rental",
        representation: "lessor",
        force_vat: false,
        property_vat_rule: "always_exempt",
        list_price: (240_000 + (i % 20) * 12_000).toFixed(2),
        commission: { basis: "percent", rate: "1/12" },
        developer_comm_base: null,
        receipt_issued: true,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0",
        referral_out_fixed: "0.00",
      });
    }
  }
  return out;
}

/** One engine input → a full deal row for a direct (service-role) insert. */
function toDealRow(
  input: DealComputeInput,
  index: number,
  workspaceId: string,
  refs: Ref,
  settings: EngineSettings,
  actor: string
) {
  const derived = dealDerivedDbFields(computeDeal(input, settings));
  const isDeveloper = input.deal_type === "developer";
  return {
    workspace_id: workspaceId,
    deal_code: `D${String(index + 1).padStart(6, "0")}`,
    booked_date: "2026-06-01",
    transaction_type: input.transaction_type,
    deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? refs.developerId : null,
    client_name: `Perf Client ${index + 1}`,
    representation: input.representation,
    property_type_id: refs.propertyTypeId,
    lead_source_id: refs.leadSourceId,
    property_details: `Synthetic unit ${index + 1}`,
    mode_of_payment: "cash",
    list_price: input.list_price,
    force_vat: input.force_vat,
    commission_basis: input.commission.basis,
    rate_pct: input.commission.basis === "percent" ? input.commission.rate : null,
    fixed_amount: input.commission.basis === "fixed" ? input.commission.amount : null,
    receipt_issued: input.receipt_issued,
    incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable,
    referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed,
    referral_paid: false,
    ...derived,
    booked_year: 2026,
    display_label: `D${String(index + 1).padStart(6, "0")} — Perf Client ${index + 1}`,
    version: 1,
    created_by: actor,
    updated_by: actor,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS" || !serviceKey || !anonKey) {
    console.log("perf:recompute — skipped (no live Supabase credentials in .env.local).");
    return;
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fresh throwaway user so the workspace starts empty.
  const existing = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find(
    (u) => u.email === PERF_EMAIL
  );
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const created = await admin.auth.admin.createUser({
    email: PERF_EMAIL,
    password: PERF_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Perf" },
  });
  if (created.error) throw new Error(`create perf user: ${created.error.message}`);
  const userId = created.data.user.id;

  const membership = await admin
    .from("membership")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle<{ workspace_id: string }>();
  const workspaceId = membership.data?.workspace_id;
  if (!workspaceId) throw new Error("signup bootstrap did not create a workspace");

  // Seed the three refs a deal needs.
  const pt = await admin
    .from("property_type")
    .insert({ workspace_id: workspaceId, name: "Perf Type", vat_rule: "threshold", created_by: userId })
    .select("id")
    .single();
  const dev = await admin
    .from("developer")
    .insert({ workspace_id: workspaceId, name: "Perf Developer", comm_base: "net", created_by: userId })
    .select("id")
    .single();
  const ls = await admin
    .from("lead_source")
    .insert({ workspace_id: workspaceId, name: "Perf Source", sort_order: 1, created_by: userId })
    .select("id")
    .single();
  if (pt.error || dev.error || ls.error) {
    throw new Error(`seed refs: ${pt.error?.message ?? dev.error?.message ?? ls.error?.message}`);
  }
  const refs: Ref = {
    propertyTypeId: pt.data.id,
    developerId: dev.data.id,
    leadSourceId: ls.data.id,
  };

  const tax = await admin
    .from("tax_settings")
    .select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered")
    .eq("workspace_id", workspaceId)
    .single();
  const settings0: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };

  console.log(`\n== M1.5 recompute perf harness — ${N} synthetic deals ==`);
  console.log(`workspace ${workspaceId} (throwaway user ${PERF_EMAIL})`);

  // --- seed N deals (direct insert, service role) ---------------------------
  const inputs = syntheticInputs(N);
  const rows = inputs.map((input, i) => toDealRow(input, i, workspaceId, refs, settings0, userId));
  const seedStart = performance.now();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const ins = await admin.from("deal").insert(chunk);
    if (ins.error) throw new Error(`insert deals: ${ins.error.message}`);
  }
  console.log(`seeded ${N} deals in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  // --- as the real user (JWT) for the RLS-scoped measurements ---------------
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  // --- target 2: single-deal compute ---------------------------------------
  for (let i = 0; i < 200; i += 1) computeDeal(inputs[i % inputs.length], settings0);
  const cDur: number[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const s = performance.now();
    computeDeal(inputs[i % inputs.length], settings0);
    cDur.push(performance.now() - s);
  }
  const computeP95 = p95(cDur);

  // --- target 1: deal-list query P95 ----------------------------------------
  const RUNS = 25;
  const listDur: number[] = [];
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const q = await user
      .from("deal")
      .select(DEAL_SELECT)
      .is("archived_at", null)
      .order("booked_date", { ascending: false })
      .order("deal_code", { ascending: false });
    const ms = performance.now() - s;
    if (q.error) throw new Error(`list query: ${q.error.message}`);
    if (i >= 3) listDur.push(ms); // drop warm-up
  }
  const listP95 = p95(listDur);

  // --- target 3: bulk recompute of N deals < 30 s ---------------------------
  // Change EWT so every taxable deal actually moves, then drain the event.
  const newEwt = settings0.ewt_rate === "0.0500" ? "0.1000" : "0.0500";
  const count = await user.rpc("count_affected_deals", {
    p_entity_type: "tax_settings",
    p_entity_id: null,
    p_fields: ["ewt_rate"],
  });
  const upd = await user.rpc("update_tax_settings", {
    p_ewt_rate: newEwt,
    p_affected_deal_count: count.data ?? 0,
  });
  if (upd.error) throw new Error(`update_tax_settings: ${upd.error.message}`);
  const eventId = (upd.data as { recompute_event_id: string }).recompute_event_id;

  const settings1: EngineSettings = { ...settings0, ewt_rate: newEwt };

  const bulkStart = performance.now();
  const start = await user.rpc("start_recompute_job", { p_event_id: eventId });
  if (start.error) throw new Error(`start_recompute_job: ${start.error.message}`);
  const jobId = (start.data as { job_id: string }).job_id;

  let restated = 0;
  for (;;) {
    const next = await user.rpc("next_recompute_deals", { p_job_id: jobId, p_limit: 200 });
    if (next.error) throw new Error(`next_recompute_deals: ${next.error.message}`);
    const batch = (next.data ?? []) as Array<Record<string, unknown>>;
    if (batch.length === 0) break;
    const results = batch.map((r) => {
      const derived = dealDerivedDbFields(
        computeDeal(
          {
            deal_type: dealTypeToEngine(r.deal_type as "developer" | "resale" | "n_a"),
            transaction_type: r.transaction_type as DealComputeInput["transaction_type"],
            representation: r.representation as DealComputeInput["representation"],
            force_vat: r.force_vat as boolean,
            property_vat_rule: r.property_vat_rule as DealComputeInput["property_vat_rule"],
            list_price: r.list_price as string,
            commission:
              r.commission_basis === "percent"
                ? { basis: "percent", rate: (r.rate_pct as string) ?? "0" }
                : { basis: "fixed", amount: (r.fixed_amount as string) ?? "0" },
            developer_comm_base: (r.developer_comm_base as "gross" | "net" | null) ?? null,
            receipt_issued: r.receipt_issued as boolean,
            incentive_billed: r.incentive_billed as string,
            incentive_taxable: (r.incentive_taxable as "yes" | "no" | null) ?? null,
            referral_out_pct: r.referral_out_pct as string,
            referral_out_fixed: r.referral_out_fixed as string,
          },
          settings1
        )
      );
      return { id: r.id, expected_version: r.version, ...derived };
    });
    const apply = await user.rpc("apply_recompute_batch", { p_job_id: jobId, p_results: results });
    if (apply.error) throw new Error(`apply_recompute_batch: ${apply.error.message}`);
    restated = (apply.data as { restated: number }).restated;
  }
  const done = await user.rpc("complete_recompute_job", { p_job_id: jobId });
  if (done.error) throw new Error(`complete_recompute_job: ${done.error.message}`);
  const bulkMs = performance.now() - bulkStart;

  // --- report ----------------------------------------------------------------
  const pass = (ok: boolean) => (ok ? "PASS" : "FAIL");
  const listOk = listP95 < LIST_P95_MS;
  const computeOk = computeP95 < SINGLE_COMPUTE_MS;
  const bulkOk = bulkMs < BULK_MS;

  console.log("\n-- results --");
  console.log(`deal-list query P95:      ${listP95.toFixed(1)} ms   (< ${LIST_P95_MS} ms)   ${pass(listOk)}`);
  console.log(`single-deal compute P95:  ${computeP95.toFixed(3)} ms (< ${SINGLE_COMPUTE_MS} ms)    ${pass(computeOk)}`);
  console.log(`bulk recompute of ${N}:  ${(bulkMs / 1000).toFixed(1)} s  (< ${BULK_MS / 1000} s)     ${pass(bulkOk)}   [${restated} restated]`);

  // --- teardown --------------------------------------------------------------
  await admin.auth.admin.deleteUser(userId);
  const remaining = await admin.from("deal").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  console.log(`\nteardown: perf user deleted; deals left in workspace: ${remaining.count ?? 0}`);

  if (!listOk || !computeOk || !bulkOk) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
