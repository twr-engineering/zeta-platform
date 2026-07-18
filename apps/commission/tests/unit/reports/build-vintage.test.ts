import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVintageMatrix,
  buildBookingYearSummary,
  buildCashPerYear,
  VINTAGE_MATRIX_CAPTION,
  type MatrixPayment,
  type ReportReceivable,
  type ReportPayment,
} from "../../../src/lib/reports/build.ts";

/**
 * M8.2 — the vintage matrix (report 2) and the booking-year summary (report 5) over
 * the v30.20 workbook fixture, plus the synthetic multi-year cases the acceptance
 * criteria call for. Every figure ties to the centavo (Milestones test plan 4, 5, 6,
 * 7, 9, 11); the FR-M8-14 cross-checks against report 1 are asserted here too.
 */

// --- the 8 live payments as matrix rows (WORKBOOK_REFERENCE §3–4) -------------
// All eight are paid 2026 on deals booked 2026 (net cash equals net of VAT for the
// seven untaxed collections; D021's incentive release is the one that differs).

/** A matrix payment paid `yearPaid`, booked `bookedYear`, equal net of VAT / net cash. */
function pay(
  yearPaid: number,
  bookedYear: number | null,
  netOfVat: string,
  netCash: string = netOfVat
): MatrixPayment {
  return { net_of_vat: netOfVat, net_cash: netCash, year_paid: yearPaid, booked_year: bookedYear };
}

/** The 8 workbook payments as matrix rows — all paid 2026, booked 2026. */
function workbookMatrixPayments(): MatrixPayment[] {
  return [
    pay(2026, 2026, "436050.00"), // D001
    pay(2026, 2026, "875000.00"), // D004
    pay(2026, 2026, "22500.00"), // D017
    pay(2026, 2026, "130000.00"), // D018
    pay(2026, 2026, "10000.00"), // D019
    pay(2026, 2026, "37500.00"), // D020
    pay(2026, 2026, "352500.00"), // D006
    pay(2026, 2026, "44642.86", "45535.71"), // D021 incentive release
  ];
}

/** All 21 workbook deals are booked 2026 (the matrix column-axis source). */
const BOOKED_YEARS_2026 = new Array(21).fill(2026) as number[];

// --- the 21 workbook receivables (WORKBOOK_REFERENCE §3, §5) for report 5 -----

/** A receivable: booked year, status, and the M4-engine money (all booked 2026). */
function rcv(
  status: ReportReceivable["status"],
  gci: string,
  collected: string,
  balance: string | null,
  over: Partial<ReportReceivable> = {}
): ReportReceivable {
  return {
    booked_year: 2026,
    status,
    booked_net_gci: gci,
    collected_net: collected,
    balance,
    written_off: null,
    ...over,
  };
}

/**
 * The 21 workbook receivables. Seven are Closed (fully collected, zero balance); D021
 * is Open with a partial (44,642.86 collected, 309,948.98 balance); the other thirteen
 * are Open with nothing collected (balance = their booked NET GCI). No Cancelled deals
 * in the fixture — so Outstanding matches the sheet exactly (OQ4 split is a no-op here).
 */
function workbookReceivables(): ReportReceivable[] {
  return [
    rcv("closed", "436050.00", "436050.00", "0.00"), // D001
    rcv("open", "126500.00", "0.00", "126500.00"), // D002
    rcv("open", "117500.00", "0.00", "117500.00"), // D003
    rcv("closed", "800000.00", "875000.00", "0.00"), // D004 (referral-out; collected > GCI)
    rcv("open", "675000.00", "0.00", "675000.00"), // D005
    rcv("closed", "352500.00", "352500.00", "0.00"), // D006
    rcv("open", "180000.00", "0.00", "180000.00"), // D007
    rcv("open", "317414.70", "0.00", "317414.70"), // D008
    rcv("open", "322724.20", "0.00", "322724.20"), // D009
    rcv("open", "426953.13", "0.00", "426953.13"), // D010
    rcv("open", "155803.57", "0.00", "155803.57"), // D011
    rcv("open", "206696.43", "0.00", "206696.43"), // D012
    rcv("open", "906752.23", "0.00", "906752.23"), // D013
    rcv("open", "401965.08", "0.00", "401965.08"), // D014
    rcv("open", "77232.14", "0.00", "77232.14"), // D015
    rcv("open", "630813.93", "0.00", "630813.93"), // D016
    rcv("closed", "22500.00", "22500.00", "0.00"), // D017
    rcv("closed", "130000.00", "130000.00", "0.00"), // D018
    rcv("closed", "10000.00", "10000.00", "0.00"), // D019
    rcv("closed", "37500.00", "37500.00", "0.00"), // D020
    rcv("open", "354591.84", "44642.86", "309948.98"), // D021 (partial)
  ];
}

/** The workbook's eight paid years, all 2026 (report 5's range-union input). */
const PAID_YEARS_2026 = new Array(8).fill(2026) as number[];

// === Report 2 — Vintage Matrix (AC2/AC3, test plan 4) ========================

test("Matrix: single populated cell (2026,2026) in the default Net of VAT view", () => {
  const m = buildVintageMatrix(workbookMatrixPayments(), BOOKED_YEARS_2026);

  assert.equal(m.value, "net_of_vat", "default toggle is Net of VAT (FR-M8-04)");
  assert.deepEqual(m.paidYears, [2026], "one paid-year row");
  assert.deepEqual(m.bookedYears, [2026], "one booking-year column");
  assert.equal(m.rows.length, 1);

  const row = m.rows[0];
  assert.equal(row.yearPaid, 2026);
  assert.deepEqual(row.cells, ["1908192.86"], "the single cell = report 1's 2026 net of VAT");
  assert.equal(row.total, "1908192.86", "row total equals the single cell");

  assert.deepEqual(m.columnTotals, ["1908192.86"]);
  assert.equal(m.grandTotal, "1908192.86");
});

test("Matrix: the Net Cash toggle re-values the same cell (AC3)", () => {
  const m = buildVintageMatrix(workbookMatrixPayments(), BOOKED_YEARS_2026, "net_cash");

  assert.equal(m.value, "net_cash");
  assert.deepEqual(m.rows[0].cells, ["1909085.71"]);
  assert.equal(m.rows[0].total, "1909085.71");
  assert.equal(m.grandTotal, "1909085.71");
});

test("Matrix: the reading-guide caption is the verbatim spec string", () => {
  assert.equal(
    VINTAGE_MATRIX_CAPTION,
    "Diagonal = collected in the year booked · below diagonal = pre-selling collection tail."
  );
});

test("Matrix: below-diagonal tail — book 2025, collect 2025 + 2026", () => {
  // A 2025 booking that keeps paying into 2026: the 2026 payment lands BELOW the
  // diagonal (y_paid 2026 > y_booked 2025) — the pre-selling collection tail.
  const payments: MatrixPayment[] = [
    pay(2025, 2025, "100000.00"), // diagonal: collected the year booked
    pay(2026, 2025, "60000.00"), // below diagonal: the tail
  ];
  const m = buildVintageMatrix(payments, [2025]);

  assert.deepEqual(m.paidYears, [2025, 2026], "rows span the paid years");
  assert.deepEqual(m.bookedYears, [2025], "one booking-year column");
  // Row 2025 (diagonal cell), row 2026 (below-diagonal tail cell).
  assert.deepEqual(m.rows[0].cells, ["100000.00"]);
  assert.deepEqual(m.rows[1].cells, ["60000.00"]);
  assert.equal(m.rows[0].total, "100000.00");
  assert.equal(m.rows[1].total, "60000.00");
  assert.deepEqual(m.columnTotals, ["160000.00"]);
  assert.equal(m.grandTotal, "160000.00");
});

test("Matrix: an above-diagonal cell (paid before booking) is rendered, not hidden (rule 9)", () => {
  // A payment paid 2025 on a deal booked 2026 — y_paid < y_booked, above the diagonal.
  // M8 renders it as-is; flagging the anomaly is M6's job, not the matrix's.
  const payments: MatrixPayment[] = [pay(2025, 2026, "25000.00")];
  const m = buildVintageMatrix(payments, [2026]);

  assert.deepEqual(m.paidYears, [2025], "the paid-2025 row exists");
  assert.deepEqual(m.bookedYears, [2026], "the booked-2026 column exists");
  assert.deepEqual(m.rows[0].cells, ["25000.00"], "the above-diagonal cell carries the cash");
  assert.equal(m.rows[0].total, "25000.00");
  assert.equal(m.grandTotal, "25000.00");
});

test("Matrix: a paid year with no booking adds a ROW but no COLUMN (rule 8, AC7)", () => {
  // A 2027 payment on a 2026-booked deal; no deal is booked 2027. The matrix gains a
  // 2027 row with cell (2027,2026) = 100,000 — and NO 2027 column (columns span
  // booking years only, sourced from the deals, which have none in 2027).
  const payments = [...workbookMatrixPayments(), pay(2027, 2026, "100000.00")];
  const m = buildVintageMatrix(payments, BOOKED_YEARS_2026);

  assert.deepEqual(m.paidYears, [2026, 2027], "rows extend to 2027");
  assert.deepEqual(m.bookedYears, [2026], "columns stay at 2026 only — no 2027 column");
  const row2027 = m.rows.find((r) => r.yearPaid === 2027)!;
  assert.deepEqual(row2027.cells, ["100000.00"], "cell (2027,2026) = 100,000");
  assert.equal(row2027.total, "100000.00");
  assert.equal(m.columnTotals[0], "2008192.86", "the 2026 column now includes the 2027 tail");
});

test("Matrix: a booked year with no cash adds a COLUMN with an all-zero body (AC8)", () => {
  // One synthetic deal booked 2024, no payments → the matrix gains a 2024 column, all
  // zeros; the 2026 payments still sit in the 2026 column.
  const m = buildVintageMatrix(workbookMatrixPayments(), [...BOOKED_YEARS_2026, 2024]);

  assert.deepEqual(m.bookedYears, [2024, 2025, 2026], "columns fill 2024→2026 contiguously");
  assert.deepEqual(m.paidYears, [2026], "only 2026 has cash, so one row");
  assert.deepEqual(
    m.rows[0].cells,
    ["0.00", "0.00", "1908192.86"],
    "2024 and 2025 columns are zero; the cash is in 2026"
  );
  assert.equal(m.rows[0].total, "1908192.86");
  assert.deepEqual(m.columnTotals, ["0.00", "0.00", "1908192.86"]);
});

test("Matrix: the live join re-vintages a corrected booked year, money unchanged (rule 6/5)", () => {
  // Same payment (unchanged stored splits) but its deal's booked year is corrected
  // 2026 → 2025: the cash MOVES to the 2025 column. The money never changes — only the
  // column attribution follows the live join.
  const before = buildVintageMatrix([pay(2026, 2026, "436050.00")], [2026]);
  const after = buildVintageMatrix([pay(2026, 2025, "436050.00")], [2025]);

  assert.deepEqual(before.bookedYears, [2026]);
  assert.deepEqual(before.rows[0].cells, ["436050.00"]);
  // After the correction the column is 2025; the cell VALUE is byte-identical.
  assert.deepEqual(after.bookedYears, [2025]);
  assert.deepEqual(after.rows[0].cells, ["436050.00"]);
  assert.equal(before.rows[0].total, after.rows[0].total);
});

test("Matrix: a dangling payment (no resolvable booking year) throws loudly (rule 15)", () => {
  const payments: MatrixPayment[] = [pay(2026, null, "100000.00")];
  assert.throws(
    () => buildVintageMatrix(payments, [2026]),
    /dangling reference|booking year/i,
    "the builder must fail loudly, never silently drop the cash"
  );
});

test("Matrix: empty workspace → no rows, no columns, zero grand total", () => {
  const m = buildVintageMatrix([], []);
  assert.deepEqual(m.paidYears, []);
  assert.deepEqual(m.bookedYears, []);
  assert.deepEqual(m.rows, []);
  assert.deepEqual(m.columnTotals, []);
  assert.equal(m.grandTotal, "0.00");
});

// === Report 5 — Booking-Year Summary (AC6, test plan 5) ======================

test("Report 5: workbook row 2026 ties to the anchors; TOTAL identical", () => {
  const report = buildBookingYearSummary(workbookReceivables(), PAID_YEARS_2026);

  assert.equal(report.rows.length, 1, "single booking year in the fixture");
  const row = report.rows[0];
  assert.equal(row.year, 2026);
  assert.equal(row.deals, 21, "every deal counts, all statuses");
  assert.equal(row.gci, "6688497.25", "Σ NET GCI of D001–D021");
  assert.equal(row.collected, "1908192.86", "Σ receivable.collected");
  assert.equal(row.outstanding, "4855304.39", "Σ open balances");
  assert.equal(row.writtenOff, "0.00", "no Cancelled deals in the fixture");

  // TOTAL identical to the single row (rule 13).
  assert.equal(report.total.deals, 21);
  assert.equal(report.total.gci, "6688497.25");
  assert.equal(report.total.collected, "1908192.86");
  assert.equal(report.total.outstanding, "4855304.39");
  assert.equal(report.total.writtenOff, "0.00");
});

test("Report 5: Collected + Outstanding = Σ Total Collectible, ₱75,000 above GCI (§3.6 note)", () => {
  // The rule-of-§3.6 note: Collected + Outstanding = 6,763,497.25 = Σ Total Collectible,
  // which exceeds GCI 6,688,497.25 by exactly D004's ₱75,000 referral-out.
  const { total } = buildBookingYearSummary(workbookReceivables(), PAID_YEARS_2026);
  const sum = (Number(total.collected) + Number(total.outstanding)).toFixed(2);
  assert.equal(sum, "6763497.25");
  assert.equal((Number(sum) - Number(total.gci)).toFixed(2), "75000.00");
});

test("Report 5: a paid year with no booking is a Deals-0 zero row (rule 2, AC7)", () => {
  // A 2027 payment against a 2026 deal, no 2027 booking → report 5 gains a 2027 row
  // with Deals 0 and all-zero money (the range is the union of booked + paid years).
  const report = buildBookingYearSummary(workbookReceivables(), [...PAID_YEARS_2026, 2027]);

  assert.deepEqual(report.rows.map((r) => r.year), [2026, 2027]);
  const row2027 = report.rows[1];
  assert.equal(row2027.deals, 0);
  assert.equal(row2027.gci, "0.00");
  assert.equal(row2027.collected, "0.00");
  assert.equal(row2027.outstanding, "0.00");
  assert.equal(row2027.writtenOff, "0.00");
  // The TOTAL is unchanged by the zero row.
  assert.equal(report.total.deals, 21);
  assert.equal(report.total.collected, "1908192.86");
});

test("Report 5: a booked-2024/no-cash deal shows Deals 1, zero rows fill the gap (AC8)", () => {
  const extra = rcv("open", "500000.00", "0.00", "500000.00", { booked_year: 2024 });
  const report = buildBookingYearSummary([...workbookReceivables(), extra], PAID_YEARS_2026);

  assert.deepEqual(report.rows.map((r) => r.year), [2024, 2025, 2026]);
  const [y2024, y2025] = report.rows;
  assert.equal(y2024.deals, 1);
  assert.equal(y2024.gci, "500000.00");
  assert.equal(y2024.collected, "0.00");
  assert.equal(y2024.outstanding, "500000.00");
  assert.equal(y2025.deals, 0, "2025 is a contiguous zero row, not a gap");
  assert.equal(y2025.gci, "0.00");
  // TOTAL now spans 22 deals.
  assert.equal(report.total.deals, 22);
});

test("Report 5: a Cancelled deal's balance splits into Written-off, NOT Outstanding (OQ4)", () => {
  // OQ4 default (master PRD Q18 = "Split, flagged as sheet departure"): a Cancelled
  // deal's written-off balance goes in the Written-off column; Outstanding is open
  // balances only. Its collected cash stays in Collected, and it still counts as a deal.
  const cancelled = rcv("cancelled", "300000.00", "50000.00", "250000.00", {
    written_off: "250000.00",
  });
  const report = buildBookingYearSummary([...workbookReceivables(), cancelled], PAID_YEARS_2026);
  const row = report.rows[0];

  assert.equal(row.deals, 22, "the Cancelled deal still counts");
  assert.equal(row.collected, "1958192.86", "its 50,000 collected stays in Collected");
  assert.equal(row.outstanding, "4855304.39", "Outstanding is UNCHANGED — no lumping");
  assert.equal(row.writtenOff, "250000.00", "its balance is split into Written-off");
});

test("Report 5: an overpaid open deal's negative balance nets in signed (rule 11)", () => {
  const overpaid = rcv("open", "100000.00", "120000.00", "-20000.00");
  const report = buildBookingYearSummary([overpaid], [2026]);
  // Outstanding sums the signed balance as-is: −20,000, never clamped to zero.
  assert.equal(report.rows[0].outstanding, "-20000.00");
});

test("Report 5: empty workspace → no rows, zero TOTAL", () => {
  const report = buildBookingYearSummary([], []);
  assert.deepEqual(report.rows, []);
  assert.equal(report.total.deals, 0);
  assert.equal(report.total.gci, "0.00");
  assert.equal(report.total.collected, "0.00");
  assert.equal(report.total.outstanding, "0.00");
  assert.equal(report.total.writtenOff, "0.00");
});

// === FR-M8-14 cross-checks (test plan 11) ====================================

test("Cross-check: matrix row totals ≡ report 1 per-year Net of VAT", () => {
  const matrixPayments = workbookMatrixPayments();
  const m = buildVintageMatrix(matrixPayments, BOOKED_YEARS_2026);

  // Report 1 over the same payments (ReportPayment is MatrixPayment minus booked_year,
  // plus the tax columns the matrix ignores — build a report-1 view of the same cash).
  const reportPayments: ReportPayment[] = matrixPayments.map((p) => ({
    net_of_vat: p.net_of_vat,
    net_cash: p.net_cash,
    vat_amount: "0.00",
    ewt_amount: "0.00",
    year_paid: p.year_paid,
    month_paid: 7,
  }));
  const r1 = buildCashPerYear(reportPayments, BOOKED_YEARS_2026);

  const r1y2026 = r1.rows.find((r) => r.year === 2026)!;
  const matrixRow2026 = m.rows.find((r) => r.yearPaid === 2026)!;
  assert.equal(matrixRow2026.total, r1y2026.netOfVat, "matrix row total ≡ report 1 net of VAT");
  assert.equal(m.grandTotal, r1.total.netOfVat, "matrix grand total ≡ report 1 TOTAL");
});

test("Cross-check: report 5 Collected TOTAL ≡ report 1 all-years Net-of-VAT TOTAL", () => {
  // The receivables' collected_net is Σ payment net_of_vat per deal, so Σ over all
  // receivables must equal report 1's all-years Net-of-VAT TOTAL (1,908,192.86).
  const r5 = buildBookingYearSummary(workbookReceivables(), PAID_YEARS_2026);
  assert.equal(r5.total.collected, "1908192.86");
});
