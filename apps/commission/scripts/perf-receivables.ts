/**
 * M4.4 — the live receivables-ledger perf harness (M4 PRD §8, test plan 12).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-receivables.ts [N]
 *   pnpm run perf:receivables
 *
 * Seeds N receivables (default 1,000) — one per synthetic deal — into a THROWAWAY
 * workspace, then measures the two DB-bound M4.4 perf targets against a real
 * project and reports the numbers:
 *
 *   - ledger read (the /collectibles query + live idle overlay + Rule Q sort)  P95 < 500 ms
 *   - each downstream projection over the 1,000 rows                            < 300 ms
 *
 * The fixtures are NEVER committed: a throwaway auth user (own workspace via the
 * signup bootstrap), rows inserted with the service role, measured as that user
 * with a real JWT, then the user is deleted — the orphan reaper takes the
 * workspace and every deal / receivable with it, back to baseline.
 *
 * CI-safe: with placeholder credentials it prints "skipped" and exits 0 (the pure
 * projection budget is proven by tests/unit/receivables/projections.test.ts, which
 * runs with no database at all).
 */
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";
import { RECEIVABLE_SELECT } from "@/lib/supabase/selects";
import { computeAgeMonths, computeMonthsIdle, compareChasePriority } from "@/lib/receivables/idle";
import { manilaToday } from "@/lib/date/manila";
import {
  agingRows,
  bookingYearSummary,
  chaseProjection,
  perDeveloperRollups,
  perSourceRollups,
  positionTotals,
  searchProjection,
} from "@/lib/receivables/projections";

const N = Number(process.argv[2] ?? 1000);
const PERF_EMAIL = "perf-receivables@solo.test";
const PERF_PASSWORD = "zeta-perf-password";

// Targets (M4 PRD §8).
const LIST_P95_MS = 500;
const PROJECTION_MS = 300;

const RECEIVABLE_LIST_SELECT = `${RECEIVABLE_SELECT},developer:developer_id(name)`;

function loadEnv(): Record<string, string> {
  // No .env.local (CI, fresh clone) means no live credentials: return nothing so the
  // caller's "skipped" branch runs instead of crashing on ENOENT.
  const envFile = new URL("../.env.local", import.meta.url);
  if (!existsSync(envFile)) return {};
  const raw = readFileSync(envFile, "utf8");
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

type Ref = { propertyTypeId: string; developerA: string; developerB: string; leadA: string; leadB: string };

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
  const code = `D${String(index + 1).padStart(6, "0")}`;
  return {
    workspace_id: workspaceId,
    deal_code: code,
    booked_date: `${2022 + (index % 5)}-06-01`,
    transaction_type: input.transaction_type,
    deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? (index % 2 === 0 ? refs.developerA : refs.developerB) : null,
    client_name: `Perf Client ${index + 1}`,
    representation: input.representation,
    property_type_id: refs.propertyTypeId,
    lead_source_id: index % 2 === 0 ? refs.leadA : refs.leadB,
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
    booked_year: 2022 + (index % 5),
    display_label: `${code} — Perf Client ${index + 1}`,
    version: 1,
    created_by: actor,
    updated_by: actor,
  };
}

/** A deal row → its receivable row (direct insert; total_collectible is generated). */
function toReceivableRow(
  deal: Record<string, unknown>,
  dealId: string,
  index: number,
  actor: string
) {
  const collectible = deal.default_total_collectible as string;
  // Vary the lifecycle: ~1 in 5 Closed (paid in full), ~1 in 12 Cancelled, rest
  // Open with a partial or zero collection.
  const kind = index % 12;
  let status: "open" | "closed" | "cancelled" = "open";
  let collected = "0.00";
  let balance = collectible;
  let variance: string | null = null;
  let writtenOff: string | null = null;
  let lastPayment: string | null = null;
  let firstPayment: string | null = null;
  let daysToFirst: number | null = null;

  if (kind === 11) {
    status = "cancelled";
    collected = (Number(collectible) * 0.3).toFixed(2);
    balance = (Number(collectible) - Number(collected)).toFixed(2);
    writtenOff = balance;
  } else if (index % 5 === 0) {
    status = "closed";
    collected = collectible;
    balance = "0.00";
    variance = "0.00";
    lastPayment = "2025-03-01";
    firstPayment = "2025-02-01";
    daysToFirst = 30;
  } else if (index % 3 === 0) {
    // partial collection
    collected = (Number(collectible) * 0.4).toFixed(2);
    balance = (Number(collectible) - Number(collected)).toFixed(2);
    lastPayment = "2026-05-15";
    firstPayment = "2026-04-10";
    daysToFirst = 60;
  }

  const pct = Number(collectible) === 0 ? null : (Number(collected) / Number(collectible)).toFixed(6);

  return {
    workspace_id: deal.workspace_id,
    deal_id: dealId,
    deal_code: deal.deal_code,
    booked_year: deal.booked_year,
    developer_id: deal.developer_id,
    client_name: deal.client_name,
    property_details: deal.property_details,
    deal_type: deal.deal_type,
    lead_source_id: deal.lead_source_id,
    booking_date: deal.booked_date,
    booked_net_gci: deal.net_gci,
    default_total_collectible: collectible,
    confirmed_collectible: index % 25 === 0 ? (Number(collectible) * 0.95).toFixed(2) : null,
    status,
    collected_net: collected,
    balance,
    pct_collected: pct,
    variance,
    written_off: writtenOff,
    last_payment_date: lastPayment,
    first_payment_date: firstPayment,
    days_to_first_release: daysToFirst,
    chase_priority: balance,
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
    console.log("perf:receivables — skipped (no live Supabase credentials in .env.local).");
    return;
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

  const pt = await admin.from("property_type").insert({ workspace_id: workspaceId, name: "Perf Type", vat_rule: "threshold", created_by: userId }).select("id").single();
  const devA = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer A", comm_base: "net", created_by: userId }).select("id").single();
  const devB = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer B", comm_base: "gross", created_by: userId }).select("id").single();
  const lsA = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source A", sort_order: 1, created_by: userId }).select("id").single();
  const lsB = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source B", sort_order: 2, created_by: userId }).select("id").single();
  if (pt.error || devA.error || devB.error || lsA.error || lsB.error) {
    throw new Error("seed refs failed");
  }
  const refs: Ref = {
    propertyTypeId: pt.data.id,
    developerA: devA.data.id,
    developerB: devB.data.id,
    leadA: lsA.data.id,
    leadB: lsB.data.id,
  };

  const tax = await admin
    .from("tax_settings")
    .select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered, chase_idle_months")
    .eq("workspace_id", workspaceId)
    .single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };
  const chaseIdleMonths = (tax.data!.chase_idle_months as unknown as number) ?? 3;

  console.log(`\n== M4.4 receivables perf harness — ${N} receivables ==`);
  console.log(`workspace ${workspaceId} (throwaway user ${PERF_EMAIL})`);

  // --- seed N deals, then a receivable per deal (direct insert, service role) --
  const inputs = syntheticInputs(N);
  const dealRows = inputs.map((input, i) => toDealRow(input, i, workspaceId, refs, settings, userId));
  const dealIdByCode = new Map<string, string>();
  const seedStart = performance.now();
  for (let i = 0; i < dealRows.length; i += 500) {
    const chunk = dealRows.slice(i, i + 500);
    const ins = await admin.from("deal").insert(chunk).select("id,deal_code");
    if (ins.error) throw new Error(`insert deals: ${ins.error.message}`);
    for (const r of ins.data as { id: string; deal_code: string }[]) dealIdByCode.set(r.deal_code, r.id);
  }
  const recRows = dealRows.map((deal, i) =>
    toReceivableRow(deal, dealIdByCode.get(deal.deal_code as string)!, i, userId)
  );
  for (let i = 0; i < recRows.length; i += 500) {
    const chunk = recRows.slice(i, i + 500);
    const ins = await admin.from("receivable").insert(chunk);
    if (ins.error) throw new Error(`insert receivables: ${ins.error.message}`);
  }
  console.log(`seeded ${N} deals + ${N} receivables in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  // --- as the real user (JWT) for the RLS-scoped measurements ---------------
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  const today = manilaToday();

  // --- target 1: ledger read P95 (query + live idle overlay + Rule Q sort) ---
  type Row = Record<string, unknown> & {
    status: "open" | "closed" | "cancelled";
    last_payment_date: string | null;
    booking_date: string;
    balance: string | null;
    months_idle: number | null;
    deal_code: string;
  };
  const RUNS = 25;
  const listDur: number[] = [];
  let rowCount = 0;
  let lastRows: Row[] = [];
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const q = await user
      .from("receivable")
      .select(RECEIVABLE_LIST_SELECT)
      .is("archived_at", null)
      .order("chase_priority", { ascending: false, nullsFirst: false })
      .order("deal_code", { ascending: true })
      .returns<Row[]>();
    if (q.error) throw new Error(`ledger query: ${q.error.message}`);
    // The same overlay + sort the read layer applies (src/lib/receivables/queries).
    const overlaid = (q.data ?? []).map((row) => ({
      ...row,
      months_idle: computeMonthsIdle(row, today),
      age_months: computeAgeMonths(row, today),
    }));
    overlaid.sort(compareChasePriority);
    const ms = performance.now() - s;
    if (i >= 3) listDur.push(ms); // drop warm-up
    rowCount = overlaid.length;
    lastRows = overlaid as Row[];
  }
  const listP95 = p95(listDur);

  // --- target 2: each projection over the fetched rows ----------------------
  const rows = lastRows as unknown as Parameters<typeof positionTotals>[0];
  const sourceNames = new Map([
    [refs.leadA, "Perf Source A"],
    [refs.leadB, "Perf Source B"],
  ]);
  const proj: Record<string, number> = {};
  const timeProj = (label: string, fn: () => unknown) => {
    // Warm once, then measure the median-ish of 5.
    fn();
    const ds: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const s = performance.now();
      fn();
      ds.push(performance.now() - s);
    }
    proj[label] = p95(ds);
  };
  timeProj("position", () => positionTotals(rows));
  timeProj("aging", () => agingRows(rows));
  timeProj("developer", () => perDeveloperRollups(rows));
  timeProj("chase", () => chaseProjection(rows, chaseIdleMonths));
  timeProj("source", () => perSourceRollups(rows, sourceNames));
  timeProj("bookingYear", () => bookingYearSummary(rows));
  timeProj("search", () => searchProjection(rows, { onlyWithBalance: true }));

  // --- report ---------------------------------------------------------------
  console.log(`\nrows read: ${rowCount}`);
  console.log(`ledger read P95:        ${listP95.toFixed(1)} ms   (target < ${LIST_P95_MS} ms)  ${listP95 < LIST_P95_MS ? "PASS" : "FAIL"}`);
  for (const [label, ms] of Object.entries(proj)) {
    console.log(`projection ${label.padEnd(12)} P95: ${ms.toFixed(2)} ms   (target < ${PROJECTION_MS} ms)  ${ms < PROJECTION_MS ? "PASS" : "FAIL"}`);
  }

  // --- cleanup --------------------------------------------------------------
  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  const failed = listP95 >= LIST_P95_MS || Object.values(proj).some((ms) => ms >= PROJECTION_MS);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
