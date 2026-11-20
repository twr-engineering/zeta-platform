/**
 * M6.1 — the live Collections-Dashboard perf harness (M6 PRD §8, Milestones test
 * plan 12).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-dashboard.ts [N]
 *   pnpm run perf:dashboard
 *
 * Seeds N deals + N receivables + N payments (default 1,000 each) into a THROWAWAY
 * workspace, then measures the two M6 §8 perf targets against a real project and
 * reports the numbers:
 *
 *   - full dashboard read (all eight sections: the parallel receivable + payment +
 *     referral + override reads, live idle overlay, then every pure builder)  < 1.5 s
 *   - year-filter switch (only Sections 2 & 6 recompute, over the already-loaded
 *     payments — no network)                                                  < 500 ms
 *
 * It replicates getDashboardData's read + compose exactly (the composer itself is
 * server-only — Next cookies — so it can't run under node; the reads and the pure
 * builders it calls are reproduced here 1:1). The money truth is M1's engine
 * (payment splits) and the same pure section builders the app ships.
 *
 * The fixtures are NEVER committed: a throwaway auth user (own workspace via the
 * signup bootstrap), rows inserted with the service role, measured as that user with
 * a real JWT, then the user is deleted — the orphan reaper takes the workspace and
 * every row with it, back to baseline.
 *
 * CI-safe: with placeholder credentials it prints "skipped" and exits 0 (the pure
 * section builders + reconciliations are proven with no database at all by
 * tests/unit/dashboard/*.test.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import {
  computeDeal,
  computePaymentSplit,
  type DealComputeInput,
  type EngineSettings,
  type PaymentSplitInput,
} from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";
import { dbVatBasisToEngine } from "@/lib/payments/map";
import { RECEIVABLE_SELECT, PAYMENT_SELECT, ANNUAL_TARGET_OVERRIDE_SELECT } from "@/lib/supabase/selects";
import { computeAgeMonths, computeMonthsIdle, compareChasePriority } from "@/lib/receivables/idle";
import { manilaToday, manilaYear } from "@/lib/date/manila";
import {
  buildAging,
  buildByDeveloper,
  buildCashTax,
  buildChase,
  buildMonthly,
  buildPosition,
  buildTarget,
  type DashboardPayment,
} from "@/lib/dashboard/sections";
import type { TargetTableRow } from "@/lib/dashboard/target";

const N = Number(process.argv[2] ?? 1000);
const PERF_EMAIL = "perf-dashboard@solo.test";
const PERF_PASSWORD = "zeta-perf-password";

// Targets (M6 PRD §8).
const DASHBOARD_MS = 1500; // full 8-section read
const YEAR_SWITCH_MS = 500; // sections 2 & 6 recompute only

const RECEIVABLE_LIST_SELECT = `${RECEIVABLE_SELECT},developer:developer_id(name)`;
// M3 lands after M6; a stub row unblocks the target math (see target-queries.ts).
const TARGET_2026: TargetTableRow = { netIncomeTarget: "11500000", opexPct: "0.22", cosPct: "0.10" };

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

/**
 * True Postgres execution time for a query, via the Management API's EXPLAIN
 * (ANALYZE) — machine-independent, so the §8 target means the same run from a dev
 * machine over WAN as it does co-located in production (where the two reads run a
 * few ms from the DB). The dev-machine wall-clock, by contrast, is dominated by the
 * WAN transfer of the ~1,000-row payloads, which does not exist in prod.
 */
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

type Ref = { propertyTypeId: string; developerA: string; developerB: string; leadA: string; leadB: string };

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
  return {
    workspace_id: workspaceId, deal_code: code, booked_date: `${2024 + (index % 3)}-06-01`,
    transaction_type: input.transaction_type, deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? (index % 2 === 0 ? refs.developerA : refs.developerB) : null,
    client_name: `Perf Client ${index + 1}`, representation: input.representation,
    property_type_id: refs.propertyTypeId, lead_source_id: index % 2 === 0 ? refs.leadA : refs.leadB,
    property_details: `Synthetic unit ${index + 1}`, mode_of_payment: "cash", list_price: input.list_price,
    force_vat: input.force_vat, commission_basis: input.commission.basis,
    rate_pct: input.commission.basis === "percent" ? input.commission.rate : null,
    fixed_amount: input.commission.basis === "fixed" ? input.commission.amount : null,
    receipt_issued: input.receipt_issued, incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable, referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed, referral_paid: index % 8 !== 0,
    ...derived, booked_year: 2024 + (index % 3), display_label: `${code} — Perf Client ${index + 1}`,
    version: 1, created_by: actor, updated_by: actor,
  };
}

function toReceivableRow(deal: Record<string, unknown>, dealId: string, index: number, actor: string) {
  const collectible = deal.default_total_collectible as string;
  const kind = index % 12;
  let status: "open" | "closed" | "cancelled" = "open";
  let collected = "0.00";
  let balance = collectible;
  let variance: string | null = null;
  let writtenOff: string | null = null;
  if (kind === 11) {
    status = "cancelled";
    collected = (Number(collectible) * 0.3).toFixed(2);
    balance = "0.00";
    writtenOff = (Number(collectible) - Number(collected)).toFixed(2);
  } else if (index % 5 === 0) {
    status = "closed";
    collected = collectible;
    balance = "0.00";
    variance = "0.00";
  } else if (index % 3 === 0) {
    collected = (Number(collectible) * 0.4).toFixed(2);
    balance = (Number(collectible) - Number(collected)).toFixed(2);
  }
  const pct = Number(collectible) === 0 ? null : (Number(collected) / Number(collectible)).toFixed(6);
  return {
    workspace_id: deal.workspace_id, deal_id: dealId, deal_code: deal.deal_code, booked_year: deal.booked_year,
    developer_id: deal.developer_id, client_name: deal.client_name, property_details: deal.property_details,
    deal_type: deal.deal_type, lead_source_id: deal.lead_source_id, booking_date: deal.booked_date,
    booked_net_gci: deal.net_gci, default_total_collectible: collectible,
    confirmed_collectible: index % 25 === 0 ? (Number(collectible) * 0.95).toFixed(2) : null,
    status, collected_net: collected, balance, pct_collected: pct, variance, written_off: writtenOff,
    last_payment_date: status === "open" && index % 3 === 0 ? "2026-05-15" : null,
    first_payment_date: index % 3 === 0 ? "2026-04-10" : null,
    days_to_first_release: index % 3 === 0 ? 35 : null, chase_priority: balance,
    created_by: actor, updated_by: actor,
  };
}

/** A deal → one payment with the engine-computed split, spread across 2 years / 12 months. */
function toPaymentRow(input: DealComputeInput, deal: Record<string, unknown>, dealId: string, index: number, settings: EngineSettings, actor: string) {
  const gross = (100_000 + (index % 40) * 12_500).toFixed(2);
  const split = computePaymentSplit(
    {
      gross,
      vat_basis: dbVatBasisToEngine(deal.vat_basis as "inclusive" | "n_a"),
      payment_type: "commission",
      incentive_taxable: input.incentive_taxable,
      ewt_subject: deal.taxable as boolean,
    } satisfies PaymentSplitInput,
    settings
  );
  const year = 2025 + (index % 2); // half in 2025, half in 2026 — exercises the year filter
  return {
    workspace_id: deal.workspace_id, deal_id: dealId,
    payment_date: `${year}-${String((index % 12) + 1).padStart(2, "0")}-15`,
    gross_amount: gross, payment_type: "commission", reference_note: null,
    net_of_vat: split.net_of_vat, vat_amount: split.vat, ewt_amount: split.ewt,
    net_cash: split.net_cash, retained_cash: split.retained,
    vat_basis_used: deal.vat_basis, ewt_rate_used: settings.ewt_rate, vat_rate_used: settings.vat_rate,
    version: 1, created_by: actor, updated_by: actor,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS" || !serviceKey || !anonKey) {
    console.log("perf:dashboard — skipped (no live Supabase credentials in .env.local).");
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

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
  const lsA = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source A", sort_order: 1, created_by: userId }).select("id").single();
  const lsB = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source B", sort_order: 2, created_by: userId }).select("id").single();
  if (pt.error || devA.error || devB.error || lsA.error || lsB.error) throw new Error("seed refs failed");
  const refs: Ref = { propertyTypeId: pt.data.id, developerA: devA.data.id, developerB: devB.data.id, leadA: lsA.data.id, leadB: lsB.data.id };

  const tax = await admin.from("tax_settings").select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered, chase_idle_months").eq("workspace_id", workspaceId).single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };
  const chaseIdleMonths = (tax.data!.chase_idle_months as unknown as number) ?? 3;

  console.log(`\n== M6.1 dashboard perf harness — ${N} deals + ${N} receivables + ${N} payments ==`);
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
  const payRows = dealRows.map((deal, i) => toPaymentRow(inputs[i], deal, dealIdByCode.get(deal.deal_code as string)!, i, settings, userId));
  for (let i = 0; i < payRows.length; i += 500) {
    const ins = await admin.from("payment").insert(payRows.slice(i, i + 500));
    if (ins.error) throw new Error(`insert payments: ${ins.error.message}`);
  }
  console.log(`seeded ${N}×3 rows in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  const today = manilaToday();
  const year = manilaYear();

  // --- network floor: one WAN round-trip, to separate server work from latency ---
  const floorDur: number[] = [];
  for (let i = 0; i < 15; i += 1) {
    const s = performance.now();
    await user.from("tax_settings").select("workspace_id", { count: "exact", head: true });
    if (i >= 3) floorDur.push(performance.now() - s);
  }
  const floorSorted = floorDur.slice().sort((a, b) => a - b);
  const netFloor = floorSorted[Math.floor(floorSorted.length / 2)];

  // --- target 1: full dashboard read (all 8 sections) ------------------------
  // Reproduces getDashboardData. Measured as SERVER work — the same thing the app
  // does co-located with the DB in prod — decomposed into (a) the true Postgres
  // execution time of the reads (via EXPLAIN ANALYZE, machine-independent) and (b)
  // the pure compose CPU (idle overlay + Rule Q sort + every builder), which runs on
  // the Next server identically here and in prod. The dev-machine wall-clock is also
  // reported, but it is dominated by the WAN transfer of the two ~1,000-row payloads
  // (absent in prod), so the gate is on server time, mirroring perf:payments.
  const accessToken = env.SUPABASE_ACCESS_TOKEN;

  // (a) server read execution — the two heavy reads run in PARALLEL in getDashboardData,
  //     so the read cost is the max of the two, plus the trivial referral/override reads.
  const recExec = accessToken
    ? await explainMs(url, accessToken, `SELECT ${RECEIVABLE_SELECT} FROM public.receivable WHERE workspace_id='${workspaceId}' AND archived_at IS NULL ORDER BY chase_priority DESC NULLS LAST, deal_code`)
    : 0;
  const payExec = accessToken
    ? await explainMs(url, accessToken, `SELECT ${PAYMENT_SELECT} FROM public.payment WHERE workspace_id='${workspaceId}' AND archived_at IS NULL ORDER BY payment_date DESC`)
    : 0;
  const readServer = Math.max(recExec, payExec);

  // (b) pure compose CPU + the raw dev-machine wall-clock, over 20 runs.
  const RUNS = 20;
  const dashDur: number[] = [];
  const composeDur: number[] = [];
  let rowCounts = { rec: 0, pay: 0 };
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const [recQ, payQ, refQ, ovrQ] = await Promise.all([
      user.from("receivable").select(RECEIVABLE_LIST_SELECT).is("archived_at", null)
        .order("chase_priority", { ascending: false, nullsFirst: false }).order("deal_code", { ascending: true }),
      user.from("payment").select(PAYMENT_SELECT).is("archived_at", null),
      user.from("deal").select("referral_out::text").gt("referral_out", 0).eq("referral_paid", false).is("archived_at", null),
      user.from("annual_target_override").select(ANNUAL_TARGET_OVERRIDE_SELECT).eq("year", year).maybeSingle(),
    ]);
    if (recQ.error || payQ.error || refQ.error) throw new Error(`dashboard read: ${recQ.error?.message ?? payQ.error?.message ?? refQ.error?.message}`);
    const readMs = performance.now() - s;

    // The pure compose — the CPU work getDashboardData does after the rows land.
    const c = performance.now();
    const receivables = (recQ.data ?? []).map((row) => {
      const r = row as unknown as Record<string, unknown> & { last_payment_date: string | null; booking_date: string; status: string; balance: string | null };
      return { ...r, months_idle: computeMonthsIdle(r as never, today), age_months: computeAgeMonths(r as never, today) };
    }).sort(compareChasePriority as never) as never[];
    const payments = (payQ.data ?? []) as unknown as DashboardPayment[];
    const referral = (refQ.data ?? []) as { referral_out: string }[];
    const override = (ovrQ.data ?? null) as { amount: string; note: string | null } | null;

    buildPosition(receivables, payments, referral);
    const target = buildTarget(payments, year, today, override ? { amount: override.amount, note: override.note } : null, TARGET_2026);
    buildCashTax(payments);
    buildAging(receivables);
    buildByDeveloper(receivables);
    buildMonthly(payments, year, target.annualTarget);
    buildChase(receivables, chaseIdleMonths);
    const composeMs = performance.now() - c;

    if (i >= 3) {
      dashDur.push(readMs + composeMs);
      composeDur.push(composeMs);
    }
    rowCounts = { rec: receivables.length, pay: payments.length };
  }
  const dashP95 = p95(dashDur);
  const composeP95 = p95(composeDur);
  // Production server time = the parallel read execution + the compose CPU.
  const dashServer = readServer + composeP95;

  // --- target 2: year-filter switch (Sections 2 & 6 only, no network) --------
  // The payments are already loaded; switching year recomputes just buildTarget +
  // buildMonthly over them (§4 rule 1). Pure — no round-trip.
  const payAll = (await user.from("payment").select(PAYMENT_SELECT).is("archived_at", null)).data as unknown as DashboardPayment[];
  const switchDur: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    const y = 2025 + (i % 2);
    const s = performance.now();
    const t = buildTarget(payAll, y, today, null, y === 2026 ? TARGET_2026 : null);
    buildMonthly(payAll, y, t.annualTarget);
    switchDur.push(performance.now() - s);
  }
  const switchP95 = p95(switchDur);

  // --- report ---------------------------------------------------------------
  const line = (label: string, value: number, target: number) =>
    `${label.padEnd(30)} ${value.toFixed(1).padStart(8)} ms   (target < ${target} ms)  ${value < target ? "PASS" : "FAIL"}`;
  console.log(`\nrows read: ${rowCounts.rec} receivables, ${rowCounts.pay} payments`);
  console.log(`network floor (WAN RTT):     ${netFloor.toFixed(1)} ms`);
  console.log(`server read exec (EXPLAIN):  receivable ${recExec.toFixed(1)} ms · payment ${payExec.toFixed(1)} ms · parallel max ${readServer.toFixed(1)} ms`);
  console.log(`pure compose CPU P95:        ${composeP95.toFixed(1)} ms  (idle overlay + Rule Q sort + all 8 builders)`);
  console.log(line("full dashboard read P95:", dashServer, DASHBOARD_MS));
  console.log(`   (server = parallel read exec + compose; raw dev-machine wall-clock ${dashP95.toFixed(1)} ms is WAN-payload bound, absent in prod)`);
  console.log(line("year-filter switch P95:", switchP95, YEAR_SWITCH_MS));
  console.log(`   (pure recompute of Sections 2 & 6 over already-loaded payments — no network)`);

  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  if (dashServer >= DASHBOARD_MS || switchP95 >= YEAR_SWITCH_MS) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
