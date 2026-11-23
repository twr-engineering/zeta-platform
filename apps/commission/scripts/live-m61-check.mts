/**
 * Headless end-to-end proof of M6.1 (the eight Collections-Dashboard section read
 * models + the AnnualTargetOverride mutations + Data Health) in a THROWAWAY
 * workspace. Imports the REAL v30.20 workbook, drains the consumers as the app does,
 * then composes every section with the SAME pure builders the app ships and asserts
 * each figure against the PRD to the centavo. Exercises the override set/clear RPCs
 * against live RLS with a real JWT and proves each Data Health check fires. Deletes
 * the throwaway user after (orphan reaper takes the workspace → delta-residue zero).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m61-check.mts
 *
 * Clock: the PRD's section figures are DEFINED at 2026-07-17 (aging ages, pace day
 * 198). Those assertions use that frozen civil date via the injectable `today`; the
 * reconciliation ties (aging TOTAL = outstanding, Σ developer = position) hold at any
 * clock and are also checked at the live Manila date.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { RECEIVABLE_SELECT, PAYMENT_SELECT, ANNUAL_TARGET_OVERRIDE_SELECT } from "@/lib/supabase/selects";
import { computeAgeMonths, computeMonthsIdle, compareChasePriority } from "@/lib/receivables/idle";
import { manilaToday } from "@/lib/date/manila";
import {
  buildAging, buildByDeveloper, buildCashTax, buildChase, buildMonthly, buildPosition, buildTarget,
  type DashboardPayment,
} from "@/lib/dashboard/sections";
import type { ProjectionReceivable } from "@/lib/receivables/projections";
import type { TargetTableRow } from "@/lib/dashboard/target";

function env() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const e: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return e;
}

const E = env();
const URL_ = E.NEXT_PUBLIC_SUPABASE_URL;
const ANON = E.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = E.SUPABASE_SERVICE_ROLE_KEY ?? E.SUPABASE_SECRET_KEY;
const FILE = "discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx";
const FROZEN = "2026-07-17"; // the PRD fixture clock
const TARGET_2026: TargetTableRow = { netIncomeTarget: "11500000", opexPct: "0.22", cosPct: "0.10" };

if (!URL_ || URL_ === "PLACEHOLDER_PENDING_CREDENTIALS" || !SERVICE || !ANON) {
  console.log("live-m61 — skipped (no live Supabase credentials in .env.local).");
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { db: { schema: "commission" }, auth: { persistSession: false } });
type Client = ReturnType<typeof createClient>;

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

async function makeUser(tag: string): Promise<{ uid: string; user: Client }> {
  const email = `m61-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m61-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

async function drain(user: Client, fn: "consume_deal_events" | "consume_payment_events") {
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc(fn, { p_limit: 500 });
    if (error) throw error;
    if (((data as { processed?: number })?.processed ?? 0) === 0) break;
  }
}

/** Load the receivables the way listReceivables does: select + developer join + live idle overlay. */
async function loadReceivables(user: Client, today: string): Promise<ProjectionReceivable[]> {
  const { data, error } = await user
    .from("receivable")
    .select(`${RECEIVABLE_SELECT},developer:developer_id(name)`)
    .is("archived_at", null)
    .order("chase_priority", { ascending: false, nullsFirst: false })
    .order("deal_code", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => {
      const r = row as Record<string, unknown> & { last_payment_date: string | null; booking_date: string; status: string; balance: string | null };
      return { ...r, months_idle: computeMonthsIdle(r as never, today), age_months: computeAgeMonths(r as never, today) } as unknown as ProjectionReceivable;
    })
    .sort(compareChasePriority as never);
}

async function loadPayments(user: Client): Promise<DashboardPayment[]> {
  const { data, error } = await user.from("payment").select(PAYMENT_SELECT).is("archived_at", null);
  if (error) throw error;
  return (data ?? []) as unknown as DashboardPayment[];
}

async function loadReferralOwed(user: Client): Promise<{ referral_out: string }[]> {
  const { data, error } = await user
    .from("deal")
    .select("referral_out::text")
    .gt("referral_out", 0)
    .eq("referral_paid", false)
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? []) as unknown as { referral_out: string }[];
}

let uid = "";

async function main() {
  const a = await makeUser("a");
  uid = a.uid;
  const user = a.user;

  // --- import + drain both consumers -----------------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_payment_events");

  const receivables = await loadReceivables(user, FROZEN);
  const payments = await loadPayments(user);
  const referralOwed = await loadReferralOwed(user);

  // === Section 1 — Position ===================================================
  const pos = buildPosition(receivables, payments, referralOwed);
  check("S1 Total Collectible 6,763,497.25", pos.totalCollectible === "6763497.25", pos.totalCollectible);
  check("S1 Total Collected Net 1,908,192.86", pos.collectedNet === "1908192.86", pos.collectedNet);
  check("S1 Balance Outstanding 4,855,304.39", pos.balanceOutstanding === "4855304.39", pos.balanceOutstanding);
  check("S1 % Collected 28.21%", (Number(pos.pctCollected) * 100).toFixed(2) === "28.21", pos.pctCollected ?? "null");
  check("S1 Written-off 0.00", pos.writtenOff === "0.00", pos.writtenOff);
  check("S1 Variance realized 0.00", pos.varianceRealized === "0.00", pos.varianceRealized);
  check("S1 Net Cash 1,909,085.71", pos.netCashReceived === "1909085.71", pos.netCashReceived);
  check("S1 Referral owed 0.00 across 0", pos.referralOwed === "0.00" && pos.referralOwedDeals === 0, `${pos.referralOwed}/${pos.referralOwedDeals}`);

  // === Section 3 — Cash & Tax =================================================
  const cash = buildCashTax(payments);
  check("S3 Gross 1,913,550.00", cash.gross === "1913550.00", cash.gross);
  check("S3 VAT 5,357.14", cash.vat === "5357.14", cash.vat);
  check("S3 EWT 4,464.29", cash.ewt === "4464.29", cash.ewt);
  check("S3 Net Cash 1,909,085.71", cash.netCash === "1909085.71", cash.netCash);
  check("S3 Retained 1,903,728.57", cash.retained === "1903728.57", cash.retained);

  // === Section 2 — Collected vs Target (derived via the M3 stub row) ==========
  const target = buildTarget(payments, 2026, FROZEN, null, TARGET_2026);
  check("S2 derived target 16,920,000", target.annualTarget === "16920000.00", target.annualTarget ?? "null");
  check("S2 collected-for-year 1,908,192.86", target.collectedForYear === "1908192.86", target.collectedForYear);
  check("S2 % of target 11.28%", (Number(target.pctOfTarget) * 100).toFixed(2) === "11.28", target.pctOfTarget ?? "null");
  check("S2 pace 9,178,520.55", target.paceToDate === "9178520.55", target.paceToDate ?? "null");
  check("S2 behind by 7,270,327.69", target.vsPace === "-7270327.69" && target.paceLabel === "behind", `${target.vsPace}/${target.paceLabel}`);

  // === Section 4 — Aging (frozen 2026-07-17) ==================================
  const aging = buildAging(receivables);
  const byKey = Object.fromEntries(aging.buckets.map((b) => [b.key, b]));
  check("S4 <1 month: 9 deals ₱3,438,889.69", byKey.lt1.count === 9 && byKey.lt1.balance === "3438889.69", `${byKey.lt1.count}/${byKey.lt1.balance}`);
  check("S4 1–3 months: 0", byKey.m1to3.count === 0 && byKey.m1to3.balance === "0.00");
  check("S4 3–6 months: 5 deals ₱1,416,414.70", byKey.m3to6.count === 5 && byKey.m3to6.balance === "1416414.70", `${byKey.m3to6.count}/${byKey.m3to6.balance}`);
  check("S4 6+ months: 0", byKey.m6plus.count === 0 && byKey.m6plus.balance === "0.00");
  check("S4 TOTAL ties to Balance Outstanding", aging.totalBalance === pos.balanceOutstanding, aging.totalBalance);
  // Reconciliation holds at the LIVE clock too (clock-independent tie).
  const agingLive = buildAging(await loadReceivables(user, manilaToday()));
  const posLive = buildPosition(await loadReceivables(user, manilaToday()), payments, referralOwed);
  check("S4 TOTAL ties at the live clock too", agingLive.totalBalance === posLive.balanceOutstanding, `${agingLive.totalBalance} vs ${posLive.balanceOutstanding}`);

  // === Section 5 — Receivables by Developer ===================================
  const { rows: devs, total: devTotal } = buildByDeveloper(receivables);
  const dev = (name: string) => devs.find((d) => d.developerName === name);
  const abrown = dev("Abrown Inc.");
  const resale = devs.find((d) => d.developerId === null);
  check("S5 Abrown % Collected 5.71% + avg days −1", !!abrown && (Number(abrown.pctCollected) * 100).toFixed(2) === "5.71" && abrown.avgDaysToFirstRelease === -1, `${abrown ? (Number(abrown.pctCollected) * 100).toFixed(2) : "?"}/${abrown?.avgDaysToFirstRelease}`);
  // Updated: M6.3 renders Avg Days → 1st Release at the PRD's 1-dp precision
  // (64.6, not the integer 65 M4.4 first rounded to), 2026-07-18.
  check("S5 Resale/Rental collected 1,863,550 @ 62.90% / 64.6 days", !!resale && resale.collectedNet === "1863550.00" && (Number(resale.pctCollected) * 100).toFixed(2) === "62.90" && resale.avgDaysToFirstRelease === 64.6, `${resale?.collectedNet}/${resale ? (Number(resale.pctCollected) * 100).toFixed(2) : "?"}/${resale?.avgDaysToFirstRelease}`);
  check("S5 TOTAL ties to position (balance/collected/collectible)", devTotal.balance === pos.balanceOutstanding && devTotal.collectedNet === pos.collectedNet && devTotal.collectible === pos.totalCollectible);

  // === Section 6 — Monthly Cash-In (2026) =====================================
  const monthly = buildMonthly(payments, 2026, target.annualTarget);
  const jan = monthly.rows[0];
  const jul = monthly.rows[6];
  check("S6 Jan collected 436,050 / 1 pmt / cum −973,950 vs target", jan.collectedNet === "436050.00" && jan.payments === 1 && jan.vsTarget === "-973950.00", `${jan.collectedNet}/${jan.payments}/${jan.vsTarget}`);
  check("S6 Jul collected 1,472,142.86 / net cash 1,473,035.71 / 7 pmts", jul.collectedNet === "1472142.86" && jul.netCash === "1473035.71" && jul.payments === 7, `${jul.collectedNet}/${jul.netCash}/${jul.payments}`);
  check("S6 Jul cum 1,908,192.86 vs 9,870,000 → −7,961,807.14", jul.cumulativeCollected === "1908192.86" && jul.cumulativeTarget === "9870000.00" && jul.vsTarget === "-7961807.14", `${jul.cumulativeCollected}/${jul.vsTarget}`);
  check("S6 December cumulative == Section 2 collected-for-year (reconciliation)", monthly.rows[11].cumulativeCollected === target.collectedForYear, monthly.rows[11].cumulativeCollected);

  // === Section 8 — Chase =====================================================
  const chase = buildChase(receivables, 3);
  check("S8 14 rows, head D013 ₱906,752.23 (no payment yet)", chase.rows.length === 14 && chase.rows[0].dealCode === "D013" && chase.rows[0].balance === "906752.23" && chase.rows[0].followUp === "no_payment_yet", `${chase.rows.length}/${chase.rows[0]?.dealCode}/${chase.rows[0]?.balance}`);
  check("S8 order D013→D005→D016→D010", JSON.stringify(chase.rows.slice(0, 4).map((c) => c.dealCode)) === JSON.stringify(["D013", "D005", "D016", "D010"]), chase.rows.slice(0, 4).map((c) => c.dealCode).join("→"));
  check("S8 D021 last payment 2026-07-09, idle 0, 'ok'", (() => { const d = chase.rows.find((c) => c.dealCode === "D021"); return !!d && d.lastPaymentDate === "2026-07-09" && d.monthsIdle === 0 && d.followUp === "ok"; })());
  check("S8 no >30 warning (14 open)", chase.overThirtyWarning === false);

  // === AnnualTargetOverride RPC round-trip (FR-M6-03) =========================
  const setRes = await user.rpc("set_annual_target_override", { p_year: 2026, p_amount: "15000000.00", p_note: "board plan" });
  check("override set ok", !(setRes.error) && (setRes.data as { ok?: boolean })?.ok === true, setRes.error?.message ?? "");
  const ovr = await user.from("annual_target_override").select(ANNUAL_TARGET_OVERRIDE_SELECT).eq("year", 2026).maybeSingle();
  const ovrRow = ovr.data as unknown as { amount: string; note: string | null } | null;
  const t2 = buildTarget(payments, 2026, FROZEN, ovrRow ? { amount: ovrRow.amount, note: ovrRow.note } : null, TARGET_2026);
  check("override → target 15,000,000, overridden, derived still 16,920,000", t2.annualTarget === "15000000.00" && t2.overridden && t2.derivedTarget === "16920000.00", `${t2.annualTarget}/${t2.derivedTarget}`);
  check("override → pace 8,136,986.30 (AC3)", t2.paceToDate === "8136986.30", t2.paceToDate ?? "null");
  const auditSet = await user.from("audit_log_entry").select("id,action").eq("entity_type", "annual_target_override").eq("action", "create");
  check("override set audited (create)", (auditSet.data ?? []).length === 1, String((auditSet.data ?? []).length));
  const clearRes = await user.rpc("clear_annual_target_override", { p_year: 2026 });
  check("override clear ok + changed", !(clearRes.error) && (clearRes.data as { changed?: boolean })?.changed === true, clearRes.error?.message ?? "");
  const ovrGone = await user.from("annual_target_override").select("id").eq("year", 2026).maybeSingle();
  check("override cleared → target reverts to derived 16,920,000", ovrGone.data === null && buildTarget(payments, 2026, FROZEN, null, TARGET_2026).annualTarget === "16920000.00");
  const auditClear = await user.from("audit_log_entry").select("id").eq("entity_type", "annual_target_override").eq("action", "archive");
  check("override clear audited (archive)", (auditClear.data ?? []).length === 1, String((auditClear.data ?? []).length));

  // === Section 7 — Data Health: baseline empty, then each check fires =========
  const healthEmpty = await dataHealth(user);
  check("S7 baseline all-clear (0/0/0)", healthEmpty.b === 0 && healthEmpty.c === 0 && healthEmpty.d === 0, `${healthEmpty.b}/${healthEmpty.c}/${healthEmpty.d}`);

  // (b) fully-paid-open: make an Open receivable's balance ≤ 0.
  await admin.from("receivable").update({ collected_net: "126500.00", balance: "0.00" }).eq("workspace_id", await wsOf(user)).eq("deal_code", "D002");
  // (c) closed-variance: give a Closed receivable |variance| > 0.50.
  await admin.from("receivable").update({ variance: "-1.00" }).eq("workspace_id", await wsOf(user)).eq("deal_code", "D001");
  // (d) referral unpaid: D004 carries referral_out 75,000 (imported Paid=Yes) → flip to unpaid.
  await admin.from("deal").update({ referral_paid: false }).eq("workspace_id", await wsOf(user)).eq("deal_code", "D004");
  const healthFired = await dataHealth(user);
  check("S7 (b) fully-paid-open fires → 1", healthFired.b === 1, String(healthFired.b));
  check("S7 (c) closed-variance>₱0.50 fires → 1", healthFired.c === 1, String(healthFired.c));
  check("S7 (d) referral-owed fires → 1 (and Section 1 tile now 75,000/1)", healthFired.d === 1, String(healthFired.d));
  const referralAfter = await loadReferralOwed(user);
  check("S7 (d) referral tile 75,000 across 1", buildPosition(receivables, payments, referralAfter).referralOwed === "75000.00" && referralAfter.length === 1);
  // (c) tolerance boundary: exactly −0.50 does NOT fire.
  await admin.from("receivable").update({ variance: "-0.50" }).eq("workspace_id", await wsOf(user)).eq("deal_code", "D001");
  check("S7 (c) tolerance: |−0.50| does NOT fire", (await dataHealth(user)).c === 0);
}

async function wsOf(user: Client): Promise<string> {
  const { data } = await user.from("receivable").select("workspace_id").limit(1).single();
  return (data as { workspace_id: string }).workspace_id;
}

/** The three receivable/deal-side Data Health counts (mirrors receivables/health.ts predicates). */
async function dataHealth(user: Client): Promise<{ b: number; c: number; d: number }> {
  const b = await user.from("receivable").select("id", { count: "exact", head: true }).eq("status", "open").is("archived_at", null).lte("balance", 0);
  const c = await user.from("receivable").select("id", { count: "exact", head: true }).eq("status", "closed").is("archived_at", null).or("variance.gt.0.50,variance.lt.-0.50");
  const d = await user.from("deal").select("id", { count: "exact", head: true }).eq("referral_paid", false).gt("referral_out", 0).is("archived_at", null);
  return { b: b.count ?? 0, c: c.count ?? 0, d: d.count ?? 0 };
}

main()
  .catch((err) => {
    console.error(err);
    fails.push(`threw: ${err?.message ?? err}`);
  })
  .finally(async () => {
    if (uid) await admin.auth.admin.deleteUser(uid);
    console.log(`\ncleaned up throwaway user (workspace cascaded away). ${fails.length ? `FAILED: ${fails.length}` : "ALL PASSED"}`);
    process.exit(fails.length ? 1 : 0);
  });
