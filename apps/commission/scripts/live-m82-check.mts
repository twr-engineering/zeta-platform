/**
 * Headless end-to-end proof of M8.2 (the vintage matrix, report 2, and the
 * booking-year summary, report 5) in a THROWAWAY workspace. Imports the REAL v30.20
 * workbook, drains the deal + payment consumers as the app does, then runs the SAME
 * pure builders the app ships (buildVintageMatrix / buildBookingYearSummary) over the
 * RLS-scoped payments + deals + receivables, and asserts every PRD §9 figure to the
 * centavo. Proves the LIVE-JOIN re-vintage (rule 6: a corrected booked date moves the
 * matrix column) alongside the snapshot doctrine (rule 5: the payment splits — and so
 * report 1 — are byte-identical after the edit), the FR-M8-14 cross-checks, and AC9
 * cross-tenant isolation. Deletes the throwaway users after (orphan reaper takes the
 * workspaces → delta-residue zero).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m82-check.mts
 *
 * Clock-independent: report 2 groups by year(paid_date) off stored snapshots, and
 * report 5's figures (deals/GCI/collected/outstanding) carry no aging — so every
 * figure is stable at any Manila date.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { PAYMENT_SELECT, RECEIVABLE_SELECT } from "@/lib/supabase/selects";
import {
  buildVintageMatrix,
  buildBookingYearSummary,
  buildCashPerYear,
  type MatrixPayment,
  type ReportReceivable,
  type ReportPayment,
} from "@/lib/reports/build";

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

if (!URL_ || URL_ === "PLACEHOLDER_PENDING_CREDENTIALS" || !SERVICE || !ANON) {
  console.log("live-m82 — skipped (no live Supabase credentials in .env.local).");
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
type Client = ReturnType<typeof createClient>;

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

async function makeUser(tag: string): Promise<{ uid: string; user: Client }> {
  const email = `m82-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m82-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

async function drain(user: Client, fn: "consume_payment_events" | "consume_deal_events") {
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc(fn, { p_limit: 500 });
    if (error) throw error;
    if (((data as { processed?: number })?.processed ?? 0) === 0) break;
  }
}

/** Load the active payments with the LIVE deal booking-year join, as the matrix does. */
async function loadMatrixPayments(user: Client): Promise<MatrixPayment[]> {
  const { data, error } = await user
    .from("payment")
    .select(`${PAYMENT_SELECT},deal:deal_id(booked_year)`)
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? []).map((p) => {
    const row = p as { net_of_vat: string; net_cash: string; year_paid: number | null; deal: { booked_year: number } | null };
    return {
      net_of_vat: row.net_of_vat,
      net_cash: row.net_cash,
      year_paid: row.year_paid,
      booked_year: row.deal?.booked_year ?? null,
    };
  });
}

/** Load the active payments as report-1 rows (the snapshot cross-check + byte-identity). */
async function loadReportPayments(user: Client): Promise<ReportPayment[]> {
  const { data, error } = await user.from("payment").select(PAYMENT_SELECT).is("archived_at", null);
  if (error) throw error;
  return (data ?? []) as unknown as ReportPayment[];
}

/** Load the active receivables the way listReceivables does — report 5's source. */
async function loadReceivables(user: Client): Promise<ReportReceivable[]> {
  const { data, error } = await user.from("receivable").select(RECEIVABLE_SELECT).is("archived_at", null);
  if (error) throw error;
  return (data ?? []) as unknown as ReportReceivable[];
}

/** The active booked years (the matrix column axis / report 5 range union). */
async function loadBookedYears(user: Client): Promise<number[]> {
  const { data, error } = await user.from("deal").select("booked_year").is("archived_at", null);
  if (error) throw error;
  return (data ?? []).map((d) => (d as { booked_year: number }).booked_year);
}

async function dealIdOf(user: Client, code: string): Promise<string> {
  const { data } = await user.from("deal").select("id").eq("deal_code", code).single();
  return (data as { id: string }).id;
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain the deal and payment consumers -------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_deal_events");
  await drain(user, "consume_payment_events");

  const matrixPayments = await loadMatrixPayments(user);
  const bookedYears = await loadBookedYears(user);
  const receivables = await loadReceivables(user);
  check(
    "imported 8 payments, 21 deals, 21 receivables",
    matrixPayments.length === 8 && bookedYears.length === 21 && receivables.length === 21,
    `${matrixPayments.length}/${bookedYears.length}/${receivables.length}`
  );

  // === Report 2 — Vintage Matrix (AC2/AC3) ===================================
  const m = buildVintageMatrix(matrixPayments, bookedYears);
  check("R2 axes = paid [2026] × booked [2026]", JSON.stringify(m.paidYears) === "[2026]" && JSON.stringify(m.bookedYears) === "[2026]", `${m.paidYears}×${m.bookedYears}`);
  check("R2 single cell (2026,2026) = 1,908,192.86 (Net of VAT)", m.rows[0]?.cells[0] === "1908192.86", m.rows[0]?.cells[0]);
  check("R2 row total 2026 = the cell", m.rows[0]?.total === "1908192.86", m.rows[0]?.total);
  check("R2 grand total = 1,908,192.86", m.grandTotal === "1908192.86", m.grandTotal);

  const mCash = buildVintageMatrix(matrixPayments, bookedYears, "net_cash");
  check("R2 Net Cash toggle cell = 1,909,085.71", mCash.rows[0]?.cells[0] === "1909085.71", mCash.rows[0]?.cells[0]);

  // === Report 5 — Booking-Year Summary (AC6) =================================
  const paidYears = matrixPayments.map((p) => p.year_paid);
  const r5 = buildBookingYearSummary(receivables, paidYears);
  check("R5 exactly one year row (2026)", r5.rows.length === 1 && r5.rows[0].year === 2026, String(r5.rows.length));
  const b = r5.rows[0];
  check("R5 Deals 21", b.deals === 21, String(b.deals));
  check("R5 GCI 6,688,497.25", b.gci === "6688497.25", b.gci);
  check("R5 Collected 1,908,192.86", b.collected === "1908192.86", b.collected);
  check("R5 Outstanding 4,855,304.39", b.outstanding === "4855304.39", b.outstanding);
  check("R5 Written-off 0.00 (no Cancelled deals; OQ4 split is a no-op)", b.writtenOff === "0.00", b.writtenOff);
  check("R5 Collected + Outstanding = 6,763,497.25 (§3.6 note)", (Number(b.collected) + Number(b.outstanding)).toFixed(2) === "6763497.25");

  // === FR-M8-14 cross-checks =================================================
  const reportPayments = await loadReportPayments(user);
  const r1 = buildCashPerYear(reportPayments, bookedYears);
  const r1y = r1.rows.find((r) => r.year === 2026)!;
  check("X matrix row total ≡ report 1 net-of-VAT (2026)", m.rows[0].total === r1y.netOfVat, `${m.rows[0].total} vs ${r1y.netOfVat}`);
  check("X R5 Collected TOTAL ≡ report 1 all-years net-of-VAT TOTAL", r5.total.collected === r1.total.netOfVat, `${r5.total.collected} vs ${r1.total.netOfVat}`);

  // === Live join re-vintage (rule 6) + snapshot doctrine (rule 5) ============
  // Correct D021's booked date across years (2026 → 2025) by editing the deal's
  // booked_year — the matrix reads deal.booked_year through a LIVE join, so its cash
  // must move to the 2025 column. The payment's stored splits never change, so report
  // 1's MONEY is conserved (rule 5): the booked-year move legitimately extends report
  // 1's zero-row RANGE to include 2025 (rule 2 — the range derives from data), but the
  // 2026 figures and the TOTAL are byte-identical — no cash moved, only a column.
  const r1Before = buildCashPerYear(await loadReportPayments(user), bookedYears);
  const d021 = await dealIdOf(user, "D021");
  const upd = await admin.from("deal").update({ booked_year: 2025 }).eq("id", d021);
  check("edited D021 booked_year 2026 → 2025", !upd.error, upd.error?.message ?? "");

  const matrixAfter = buildVintageMatrix(await loadMatrixPayments(user), await loadBookedYears(user));
  check("R2 now has a 2025 booking column (live join re-vintaged)", matrixAfter.bookedYears.includes(2025), matrixAfter.bookedYears.join(","));
  const col2025 = matrixAfter.bookedYears.indexOf(2025);
  const col2026 = matrixAfter.bookedYears.indexOf(2026);
  const row2026 = matrixAfter.rows.find((r) => r.yearPaid === 2026)!;
  // D021's ₱44,642.86 moved from the 2026 column to the 2025 column; the split is unchanged.
  check("R2 D021 cash moved to the 2025 column = 44,642.86", row2026.cells[col2025] === "44642.86", row2026.cells[col2025]);
  check("R2 2026 column dropped by exactly D021's 44,642.86 → 1,863,550.00", row2026.cells[col2026] === "1863550.00", row2026.cells[col2026]);
  check("R2 row total unchanged (cash didn't leave the year, only the column)", row2026.total === "1908192.86", row2026.total);

  const r1After = buildCashPerYear(await loadReportPayments(user), await loadBookedYears(user));
  const r1Before2026 = JSON.stringify(r1Before.rows.find((r) => r.year === 2026));
  const r1After2026 = JSON.stringify(r1After.rows.find((r) => r.year === 2026));
  check("Report 1 MONEY conserved: 2026 row + TOTAL byte-identical after the edit (rule 5)", r1Before2026 === r1After2026 && JSON.stringify(r1Before.total) === JSON.stringify(r1After.total));
  const added2025 = r1After.rows.find((r) => r.year === 2025);
  check("Report 1 range extended to a 2025 ZERO row (rule 2 live range), no cash there", !!added2025 && added2025.netOfVat === "0.00" && added2025.payments === 0, `${added2025?.netOfVat}/${added2025?.payments}`);

  // === AC9 — cross-tenant isolation ==========================================
  const bUser = await makeUser("b");
  uidB = bUser.uid;
  const otherMatrix = buildVintageMatrix(await loadMatrixPayments(bUser.user), await loadBookedYears(bUser.user));
  const otherR5 = buildBookingYearSummary(await loadReceivables(bUser.user), []);
  check("AC9 second tenant sees an empty matrix + report 5 (RLS)", otherMatrix.rows.length === 0 && otherMatrix.grandTotal === "0.00" && otherR5.rows.length === 0 && otherR5.total.deals === 0);
}

main()
  .catch((err) => {
    console.error(err);
    fails.push(`threw: ${err?.message ?? err}`);
  })
  .finally(async () => {
    if (uidA) await admin.auth.admin.deleteUser(uidA);
    if (uidB) await admin.auth.admin.deleteUser(uidB);
    console.log(`\ncleaned up throwaway users (workspaces cascaded away). ${fails.length ? `FAILED: ${fails.length}` : "ALL PASSED"}`);
    process.exit(fails.length ? 1 : 0);
  });
