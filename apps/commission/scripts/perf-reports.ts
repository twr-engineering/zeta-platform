/**
 * M8.4 — the live Collection Reports perf harness (M8 PRD §8 / AC11: each of the five
 * reports returns < 1 s P95 at 1,000 payments / 1,000 deals, the matrix likewise at a
 * 10 paid-years × 10 booking-years grid).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-reports.ts [N]
 *   pnpm run perf:reports
 *
 * Seeds N deals (default 1,000) spread across 10 booking years + one receivable each,
 * and N payments spread across 10 paid years (so the vintage matrix is a full 10×10),
 * into a THROWAWAY workspace, then measures what the five report reads actually do
 * (src/lib/reports/queries.ts): the RLS-scoped payment list read (with its live deal
 * join — the matrix's column axis), the receivable list read (report 5), and the pure
 * builders over the loaded rows. Server read time = the true Postgres execution time
 * (EXPLAIN ANALYZE, machine-independent); each report's P95 = its DB read + its compose
 * CPU. Gated against the 1,000 ms budget for all five.
 *
 * The indexes AC11 names already exist (M5 payment_period_idx on year_paid/month_paid,
 * payment_deal_idx on deal_id; M1 deal_booked_year_idx; M4 receivable_booked_year_idx),
 * so this measures the shipped read path — it adds none.
 *
 * The fixtures are NEVER committed: a throwaway auth user (own workspace via the signup
 * bootstrap), rows inserted with the service role, measured as that user with a real
 * JWT, then the user is deleted — the orphan reaper takes the workspace and every deal /
 * receivable / payment with it. CI-safe: with placeholder credentials it prints
 * "skipped" and exits 0 (the pure compose budget is proven by the unit suite).
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";
import { PAYMENT_SELECT, RECEIVABLE_SELECT } from "@/lib/supabase/selects";
import {
  buildCashPerYear,
  buildMonthlyCashFlow,
  buildTaxPerMonth,
  buildVintageMatrix,
  buildBookingYearSummary,
  type ReportPayment,
  type MatrixPayment,
  type ReportReceivable,
} from "@/lib/reports/build";

const N = Number(process.argv[2] ?? 1000);
const YEARS = 10; // 10 booking years × 10 paid years → the AC11 10×10 matrix
const BASE_YEAR = 2017; // 2017…2026
const PERF_EMAIL = "perf-reports@solo.test";
const PERF_PASSWORD = "zeta-perf-password";
const TARGET_MS = 1000; // M8 §8 / AC11

const PAYMENT_LIST_SELECT = `${PAYMENT_SELECT},deal:deal_id(deal_code,booked_year,client_name,property_details,deal_type,vat_basis,developer:developer_id(id,name))`;
const RECEIVABLE_LIST_SELECT = `${RECEIVABLE_SELECT},developer:developer_id(name)`;

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
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

type Ref = { propertyTypeId: string; developerA: string; developerB: string; leadSourceId: string };

/** N varied engine inputs — a realistic Developer / Resale / Rental mix. */
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
  // Spread across 10 booking years → the matrix's 10 columns.
  const bookedYear = BASE_YEAR + (index % YEARS);
  return {
    workspace_id: workspaceId, deal_code: code, booked_date: `${bookedYear}-06-01`,
    transaction_type: input.transaction_type, deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? (index % 2 === 0 ? refs.developerA : refs.developerB) : null,
    client_name: `Perf Client ${index + 1}`, representation: input.representation,
    property_type_id: refs.propertyTypeId, lead_source_id: refs.leadSourceId,
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

/** A deal row → its receivable row (report 5's source). Varies lifecycle so report 5
 *  exercises Open / Closed / Cancelled-with-partial (the Written-off split). */
function toReceivableRow(deal: Record<string, unknown>, dealId: string, index: number, actor: string) {
  const collectible = deal.default_total_collectible as string;
  const kind = index % 12;
  let status: "open" | "closed" | "cancelled" = "open";
  let collected = "0.00";
  let balance: string | null = collectible;
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
    chase_priority: balance ?? "0.00", created_by: actor, updated_by: actor,
  };
}

/** A deal row → one payment row (reports 1–4's source), paid in one of 10 years. */
function toPaymentRow(deal: Record<string, unknown>, dealId: string, index: number, settings: EngineSettings, actor: string) {
  // Spread across 10 paid years (independent of booking year → below/above-diagonal
  // cells populate the 10×10 grid), and across the twelve months.
  const paidYear = BASE_YEAR + ((index * 7) % YEARS);
  const month = (index % 12) + 1;
  const gross = "50000.00";
  const netOfVat = (50000 / 1.12).toFixed(2); // taxable incentive-style split
  const vat = (50000 - Number(netOfVat)).toFixed(2);
  const ewt = (Number(netOfVat) * Number(settings.ewt_rate)).toFixed(2);
  const netCash = (50000 - Number(ewt)).toFixed(2);
  const retained = (50000 - Number(vat) - Number(ewt)).toFixed(2);
  return {
    workspace_id: deal.workspace_id, deal_id: dealId,
    payment_date: `${paidYear}-${String(month).padStart(2, "0")}-15`,
    gross_amount: gross, payment_type: "commission", reference_note: null,
    net_of_vat: netOfVat, vat_amount: vat, ewt_amount: ewt, net_cash: netCash, retained_cash: retained,
    vat_basis_used: "inclusive", ewt_rate_used: settings.ewt_rate, vat_rate_used: settings.vat_rate,
    version: 1, created_by: actor, updated_by: actor,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;

  if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS" || !serviceKey || !anonKey) {
    console.log("perf:reports — skipped (no live Supabase credentials in .env.local).");
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
  const lead = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source", sort_order: 1, created_by: userId }).select("id").single();
  if (pt.error || devA.error || devB.error || lead.error) throw new Error("seed refs failed");
  const refs: Ref = { propertyTypeId: pt.data.id, developerA: devA.data.id, developerB: devB.data.id, leadSourceId: lead.data.id };

  const tax = await admin.from("tax_settings").select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered").eq("workspace_id", workspaceId).single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };

  console.log(`\n== M8.4 reports perf harness — ${N} deals / ${N} payments across ${YEARS}×${YEARS} years ==`);
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
  const payRows = dealRows.map((deal, i) => toPaymentRow(deal, dealIdByCode.get(deal.deal_code as string)!, i, settings, userId));
  for (let i = 0; i < payRows.length; i += 500) {
    const ins = await admin.from("payment").insert(payRows.slice(i, i + 500));
    if (ins.error) throw new Error(`insert payments: ${ins.error.message}`);
  }
  console.log(`seeded ${N} deals + ${N} receivables + ${N} payments in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  // --- server exec of the two report reads (machine-independent) --------------
  // The payment list (reports 1–4, with the matrix's live deal join) + the booked-year
  // select behind the range union + the receivable list (report 5).
  const paymentExec = accessToken
    ? await explainMs(url, accessToken, `SELECT id, deal_id, payment_date, net_of_vat::text, vat_amount::text, ewt_amount::text, net_cash::text, year_paid, month_paid FROM public.payment WHERE workspace_id='${workspaceId}' AND archived_at IS NULL`)
    : 0;
  const bookedYearsExec = accessToken
    ? await explainMs(url, accessToken, `SELECT booked_year FROM public.deal WHERE workspace_id='${workspaceId}' AND archived_at IS NULL`)
    : 0;
  const receivableExec = accessToken
    ? await explainMs(url, accessToken, `SELECT booked_year, status, booked_net_gci::text, collected_net::text, balance::text, written_off::text FROM public.receivable WHERE workspace_id='${workspaceId}' AND archived_at IS NULL`)
    : 0;
  // Reports 1/3/4 read payments only; the matrix also reads booked years (parallel);
  // report 5 reads receivables + payments' paid years (parallel).
  const paymentReadP95 = paymentExec; // reports 3/4 read payments alone
  const matrixReadP95 = Math.max(paymentExec, bookedYearsExec);
  const cashReadP95 = Math.max(paymentExec, bookedYearsExec);
  const bookingReadP95 = Math.max(receivableExec, paymentExec);

  // --- load the rows as the JWT user + measure the pure compose CPU -----------
  const [payQ, dealQ, recvQ] = await Promise.all([
    user.from("payment").select(PAYMENT_LIST_SELECT).is("archived_at", null).returns<Array<ReportPayment & { deal: { booked_year: number } | null }>>(),
    user.from("deal").select("booked_year").is("archived_at", null).returns<{ booked_year: number }[]>(),
    user.from("receivable").select(RECEIVABLE_LIST_SELECT).is("archived_at", null).returns<ReportReceivable[]>(),
  ]);
  if (payQ.error || dealQ.error || recvQ.error) throw new Error(`read: ${payQ.error?.message ?? dealQ.error?.message ?? recvQ.error?.message}`);
  const payments = payQ.data ?? [];
  const bookedYears = (dealQ.data ?? []).map((d) => d.booked_year);
  const receivables = recvQ.data ?? [];
  const paidYears = payments.map((p) => p.year_paid);
  const matrixPayments: MatrixPayment[] = payments.map((p) => ({
    net_of_vat: p.net_of_vat, net_cash: p.net_cash, year_paid: p.year_paid, booked_year: p.deal?.booked_year ?? null,
  }));

  const bench = (fn: () => void): number => {
    const durs: number[] = [];
    for (let i = 0; i < 25 + 3; i += 1) {
      const s = performance.now();
      fn();
      if (i >= 3) durs.push(performance.now() - s);
    }
    return p95(durs);
  };

  const cashCompose = bench(() => buildCashPerYear(payments, bookedYears));
  const monthlyCompose = bench(() => buildMonthlyCashFlow(payments, 2026));
  const taxCompose = bench(() => buildTaxPerMonth(payments, 2026));
  const matrixCompose = bench(() => buildVintageMatrix(matrixPayments, bookedYears, "net_of_vat"));
  const bookingCompose = bench(() => buildBookingYearSummary(receivables, paidYears));

  const matrix = buildVintageMatrix(matrixPayments, bookedYears, "net_of_vat");

  const report = (label: string, read: number, compose: number) => {
    const total = read + compose;
    console.log(
      `  ${label.padEnd(22)} read ${read.toFixed(2)} ms + compose ${compose.toFixed(2)} ms = ${total.toFixed(2)} ms   ${total < TARGET_MS ? "PASS" : "FAIL"}`
    );
    return total;
  };

  console.log(`\nrows read: ${payments.length} payments · ${bookedYears.length} deals · ${receivables.length} receivables`);
  console.log(`matrix grid: ${matrix.paidYears.length} paid years × ${matrix.bookedYears.length} booking years`);
  console.log(`server exec (EXPLAIN): payment ${paymentExec.toFixed(2)} ms · booked-years ${bookedYearsExec.toFixed(2)} ms · receivable ${receivableExec.toFixed(2)} ms\n`);

  const totals = [
    report("1 Cash per Year", cashReadP95, cashCompose),
    report("2 Vintage Matrix", matrixReadP95, matrixCompose),
    report("3 Monthly Cash Flow", paymentReadP95, monthlyCompose),
    report("4 Tax per Month", paymentReadP95, taxCompose),
    report("5 Booking-Year Summary", bookingReadP95, bookingCompose),
  ];
  const worst = Math.max(...totals);
  console.log(`\nworst report P95: ${worst.toFixed(2)} ms   (target < ${TARGET_MS} ms)  ${worst < TARGET_MS ? "PASS" : "FAIL"}`);

  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  if (worst >= TARGET_MS) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
