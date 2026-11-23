/**
 * M7.3 — the live Source Performance perf harness (M7 PRD §8 / criterion 10: the
 * report and each year-filter change render < 500 ms P95 at 1,000 deals / 1,000
 * payments / 60 sources).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-source-performance.ts [N] [S]
 *   pnpm run perf:source-performance
 *
 * Seeds N deals (default 1,000) + one receivable each, spread across S lead sources
 * (default 60), into a THROWAWAY workspace, then measures what getSourcePerformance
 * actually does (src/lib/source-performance/queries.ts):
 *   · the RLS-scoped receivable list read (the columns M7 aggregates)   } run in
 *   · the lead-source master-list read (active + archived)              } parallel
 *   · the pure sourcePerformance() compose over the loaded rows (CPU, all-years + a
 *     single-year filter — the year switch is the same compose over a subset)
 * Server read time = the MAX of the two parallel DB reads (EXPLAIN ANALYZE, the true
 * Postgres execution time — machine-independent); total P95 = that + the compose CPU.
 * Gated on the total against the 500 ms budget; the dev-machine wall-clock is
 * WAN-payload bound (the 1,000-row transfer) and absent in prod, reported separately.
 *
 * The fixtures are NEVER committed: a throwaway auth user (own workspace via the
 * signup bootstrap), rows inserted with the service role, measured as that user with
 * a real JWT, then the user is deleted — the orphan reaper takes the workspace and
 * every deal / receivable with it. CI-safe: with placeholder credentials it prints
 * "skipped" and exits 0 (the pure compose budget is proven by the unit suite, which
 * runs with no database at all).
 */
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";
import { RECEIVABLE_SELECT } from "@/lib/supabase/selects";
import {
  sourcePerformance,
  type SourceLeadSource,
} from "@/lib/source-performance/build";
import type { ProjectionReceivable } from "@/lib/receivables/projections";

const N = Number(process.argv[2] ?? 1000);
const SOURCES = Number(process.argv[3] ?? 60);
const PERF_EMAIL = "perf-source-performance@solo.test";
const PERF_PASSWORD = "zeta-perf-password";
const TARGET_MS = 500; // M7 §8 / criterion 10

const RECEIVABLE_LIST_SELECT = `${RECEIVABLE_SELECT},developer:developer_id(name)`;

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    // No .env.local (CI, fresh clone) means no live credentials: return nothing so the
  // caller's "skipped" branch runs instead of crashing on ENOENT.
  const envFile = new URL("../.env.local", import.meta.url);
  if (!existsSync(envFile)) return {};
  const raw = readFileSync(envFile, "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local (CI) — process.env alone drives the skip decision.
  }
  return env;
}

function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

async function explainMs(url: string, token: string, sql: string): Promise<number> {
  const ref = new URL(url).host.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}` }),
  });
  if (!res.ok) throw new Error(`EXPLAIN failed: HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as Array<{ "QUERY PLAN": Array<{ "Execution Time": number }> }>;
  return body[0]["QUERY PLAN"][0]["Execution Time"];
}

type Ref = { propertyTypeId: string; developerA: string; developerB: string; leadIds: string[] };

/** N varied engine inputs — a realistic mix of Developer / Resale / Rental deals. */
function syntheticInputs(count: number): DealComputeInput[] {
  const out: DealComputeInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = i % 5;
    const listPrice = (2_000_000 + (i % 60) * 125_000).toFixed(2);
    if (kind <= 1) {
      out.push({
        deal_type: "developer", transaction_type: "sale", representation: "seller",
        force_vat: i % 9 === 0, property_vat_rule: i % 2 === 0 ? "threshold" : "always_vat",
        list_price: listPrice, commission: { basis: "percent", rate: "0.05" },
        developer_comm_base: i % 2 === 0 ? "net" : "gross", receipt_issued: true,
        incentive_billed: (i % 3 === 0 ? 50_000 : 0).toFixed(2), incentive_taxable: i % 3 === 0 ? "yes" : null,
        referral_out_pct: "0", referral_out_fixed: (i % 4 === 0 ? 10_000 : 0).toFixed(2),
      });
    } else if (kind === 2) {
      out.push({
        deal_type: "resale", transaction_type: "sale", representation: "buyer",
        force_vat: false, property_vat_rule: "always_exempt", list_price: listPrice,
        commission: { basis: "fixed", amount: "200000.00" }, developer_comm_base: null,
        receipt_issued: true, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0.02", referral_out_fixed: "0.00",
      });
    } else if (kind === 3) {
      out.push({
        deal_type: "resale", transaction_type: "sale", representation: "double_ended",
        force_vat: false, property_vat_rule: "threshold", list_price: listPrice,
        commission: { basis: "percent", rate: "0.03" }, developer_comm_base: null,
        receipt_issued: false, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0", referral_out_fixed: "0.00",
      });
    } else {
      out.push({
        deal_type: "n/a", transaction_type: "rental", representation: "lessor",
        force_vat: false, property_vat_rule: "always_exempt",
        list_price: (240_000 + (i % 20) * 12_000).toFixed(2),
        commission: { basis: "percent", rate: "1/12" }, developer_comm_base: null,
        receipt_issued: true, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0", referral_out_fixed: "0.00",
      });
    }
  }
  return out;
}

function toDealRow(input: DealComputeInput, index: number, workspaceId: string, refs: Ref, settings: EngineSettings, actor: string) {
  const derived = dealDerivedDbFields(computeDeal(input, settings));
  const isDeveloper = input.deal_type === "developer";
  const code = `D${String(index + 1).padStart(6, "0")}`;
  // Spread across booked years 2024–2026 so a single-year filter exercises a subset.
  const bookedYear = 2024 + (index % 3);
  return {
    workspace_id: workspaceId, deal_code: code, booked_date: `${bookedYear}-06-01`,
    transaction_type: input.transaction_type, deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? (index % 2 === 0 ? refs.developerA : refs.developerB) : null,
    client_name: `Perf Client ${index + 1}`, representation: input.representation,
    property_type_id: refs.propertyTypeId, lead_source_id: refs.leadIds[index % refs.leadIds.length],
    property_details: `Synthetic unit ${index + 1}`, mode_of_payment: "cash", list_price: input.list_price,
    force_vat: input.force_vat, commission_basis: input.commission.basis,
    rate_pct: input.commission.basis === "percent" ? input.commission.rate : null,
    fixed_amount: input.commission.basis === "fixed" ? input.commission.amount : null,
    receipt_issued: input.receipt_issued, incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable, referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed, referral_paid: false,
    ...derived, booked_year: bookedYear, display_label: `${code} — Perf Client ${index + 1}`,
    version: 1, created_by: actor, updated_by: actor,
  };
}

/** A deal row → its receivable row (direct insert). Varies the lifecycle so the
 *  report exercises Open / Closed / Cancelled-with-partial buckets (§4 rules 5, 7). */
function toReceivableRow(deal: Record<string, unknown>, dealId: string, index: number, actor: string) {
  const collectible = deal.default_total_collectible as string;
  const kind = index % 12;
  let status: "open" | "closed" | "cancelled" = "open";
  let collected = "0.00";
  let balance = collectible;
  let writtenOff: string | null = null;

  if (kind === 11) {
    status = "cancelled";
    collected = (Number(collectible) * 0.3).toFixed(2);
    balance = "0.00"; // written off — the cancelled-with-partial regression at scale
    writtenOff = (Number(collectible) - Number(collected)).toFixed(2);
  } else if (index % 5 === 0) {
    status = "closed";
    collected = collectible;
    balance = "0.00";
  } else if (index % 3 === 0) {
    collected = (Number(collectible) * 0.4).toFixed(2);
    balance = (Number(collectible) - Number(collected)).toFixed(2);
  }
  const pct = Number(collectible) === 0 ? null : (Number(collected) / Number(collectible)).toFixed(6);

  return {
    workspace_id: deal.workspace_id, deal_id: dealId, deal_code: deal.deal_code,
    booked_year: deal.booked_year, developer_id: deal.developer_id, client_name: deal.client_name,
    property_details: deal.property_details, deal_type: deal.deal_type, lead_source_id: deal.lead_source_id,
    booking_date: deal.booked_date, booked_net_gci: deal.net_gci, default_total_collectible: collectible,
    status, collected_net: collected, balance, pct_collected: pct, written_off: writtenOff,
    chase_priority: balance, created_by: actor, updated_by: actor,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;

  if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS" || !serviceKey || !anonKey) {
    console.log("perf:source-performance — skipped (no live Supabase credentials in .env.local).");
    return;
  }

  const admin = createClient(url, serviceKey, { db: { schema: "commission" }, auth: { autoRefreshToken: false, persistSession: false } });

  const existing = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === PERF_EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const created = await admin.auth.admin.createUser({ email: PERF_EMAIL, password: PERF_PASSWORD, email_confirm: true, user_metadata: { display_name: "Perf" } });
  if (created.error) throw new Error(`create perf user: ${created.error.message}`);
  const userId = created.data.user.id;

  const membership = await admin.from("membership").select("workspace_id").eq("user_id", userId).maybeSingle<{ workspace_id: string }>();
  const workspaceId = membership.data?.workspace_id;
  if (!workspaceId) throw new Error("signup bootstrap did not create a workspace");

  const pt = await admin.from("property_type").insert({ workspace_id: workspaceId, name: "Perf Type", vat_rule: "threshold", created_by: userId }).select("id").single();
  const devA = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer A", comm_base: "net", created_by: userId }).select("id").single();
  const devB = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer B", comm_base: "gross", created_by: userId }).select("id").single();
  if (pt.error || devA.error || devB.error) throw new Error("seed refs failed");

  // S lead sources — a fifth of them archived, so the report exercises the
  // active-zero / archived-with-deals / "(inactive)" visibility paths at scale.
  const leadRows = Array.from({ length: SOURCES }, (_, i) => ({
    workspace_id: workspaceId, name: `Perf Source ${i + 1}`, sort_order: i + 1,
    archived_at: i % 5 === 0 ? new Date().toISOString() : null, created_by: userId,
  }));
  const leadIns = await admin.from("lead_source").insert(leadRows).select("id");
  if (leadIns.error) throw new Error(`insert lead sources: ${leadIns.error.message}`);
  const leadIds = (leadIns.data as { id: string }[]).map((r) => r.id);
  const refs: Ref = { propertyTypeId: pt.data.id, developerA: devA.data.id, developerB: devB.data.id, leadIds };

  const tax = await admin.from("tax_settings").select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered").eq("workspace_id", workspaceId).single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };

  console.log(`\n== M7.3 source-performance perf harness — ${N} deals across ${SOURCES} sources ==`);
  console.log(`workspace ${workspaceId} (throwaway user ${PERF_EMAIL})`);

  const inputs = syntheticInputs(N);
  const dealRows = inputs.map((input, i) => toDealRow(input, i, workspaceId, refs, settings, userId));
  const dealIdByCode = new Map<string, string>();
  const seedStart = performance.now();
  for (let i = 0; i < dealRows.length; i += 500) {
    const ins = await admin.from("deal").insert(dealRows.slice(i, i + 500)).select("id,deal_code");
    if (ins.error) throw new Error(`insert deals: ${ins.error.message}`);
    for (const r of ins.data as { id: string; deal_code: string }[]) dealIdByCode.set(r.deal_code, r.id);
  }
  const recRows = dealRows.map((deal, i) => toReceivableRow(deal, dealIdByCode.get(deal.deal_code as string)!, i, userId));
  for (let i = 0; i < recRows.length; i += 500) {
    const ins = await admin.from("receivable").insert(recRows.slice(i, i + 500));
    if (ins.error) throw new Error(`insert receivables: ${ins.error.message}`);
  }
  console.log(`seeded ${N} deals + ${N} receivables across ${SOURCES} sources in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  const user = createClient(url, anonKey, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  // --- server exec of the two parallel reads (machine-independent) -----------
  const recvExec = accessToken
    ? await explainMs(url, accessToken, `SELECT lead_source_id, deal_type, booked_year, status, booked_net_gci::text, collected_net::text, balance::text FROM commission.receivable WHERE workspace_id='${workspaceId}' AND archived_at IS NULL`)
    : 0;
  const srcExec = accessToken
    ? await explainMs(url, accessToken, `SELECT id, name, archived_at, sort_order FROM commission.lead_source WHERE workspace_id='${workspaceId}' ORDER BY sort_order`)
    : 0;
  const serverReadP95 = Math.max(recvExec, srcExec);

  // --- load the rows as the JWT user + measure the pure compose CPU ----------
  const [recvQ, srcQ] = await Promise.all([
    user.from("receivable").select(RECEIVABLE_LIST_SELECT).is("archived_at", null).returns<ProjectionReceivable[]>(),
    user.from("lead_source").select("*").order("sort_order", { ascending: true }).returns<SourceLeadSource[]>(),
  ]);
  if (recvQ.error || srcQ.error) throw new Error(`read: ${recvQ.error?.message ?? srcQ.error?.message}`);
  const receivables = recvQ.data ?? [];
  const sources = srcQ.data ?? [];

  const composeAll: number[] = [];
  const composeYear: number[] = [];
  let report = sourcePerformance(receivables, sources, "all");
  for (let i = 0; i < 25 + 3; i += 1) {
    let s = performance.now();
    report = sourcePerformance(receivables, sources, "all");
    if (i >= 3) composeAll.push(performance.now() - s);
    s = performance.now();
    sourcePerformance(receivables, sources, 2025); // a single-year filter switch
    if (i >= 3) composeYear.push(performance.now() - s);
  }
  const composeAllP95 = p95(composeAll);
  const composeYearP95 = p95(composeYear);

  // Total = the parallel DB reads (server) + the heavier of the two composes.
  const totalP95 = serverReadP95 + Math.max(composeAllP95, composeYearP95);

  console.log(`\nrows read: ${receivables.length} receivables · ${sources.length} sources · report rows: ${report.rows.length}`);
  console.log(`server read exec (EXPLAIN, parallel): receivable ${recvExec.toFixed(2)} ms · lead_source ${srcExec.toFixed(2)} ms → max ${serverReadP95.toFixed(2)} ms`);
  console.log(`pure compose P95:  all-years ${composeAllP95.toFixed(2)} ms · year filter ${composeYearP95.toFixed(2)} ms`);
  console.log(`\nSource Performance P95 (server read + compose): ${totalP95.toFixed(2)} ms   (target < ${TARGET_MS} ms)  ${totalP95 < TARGET_MS ? "PASS" : "FAIL"}`);

  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  if (totalP95 >= TARGET_MS) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
