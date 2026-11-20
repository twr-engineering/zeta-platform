import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCashPerYear,
  buildMonthlyCashFlow,
  buildTaxPerMonth,
  contiguousYearRange,
  type ReportPayment,
} from "../../../src/lib/reports/build.ts";

/**
 * M8.1 — the payment-period reports (1, 3, 4) over the v30.20 workbook fixture. The
 * eight live payments (one January, seven July, all paid 2026) tie to the acceptance
 * anchors, so every figure and the FR-M8-14 cross-checks are asserted to the centavo
 * (Milestones test plan items 1–3, 6, 11).
 */

// --- the 8 live payments (WORKBOOK_REFERENCE §4), as stored M5 snapshots -------

/** A payment with all-zero tax (the untaxed resale/rental collections). */
function untaxed(
  date: string,
  amount: string,
  over: Partial<ReportPayment> = {}
): ReportPayment {
  const [y, m] = date.split("-").map(Number);
  return {
    net_of_vat: amount,
    net_cash: amount,
    vat_amount: "0.00",
    ewt_amount: "0.00",
    year_paid: y,
    month_paid: m,
    ...over,
  };
}

/** The 8 live payments — the exact stored splits from WORKBOOK_REFERENCE §4. */
function workbookPayments(): ReportPayment[] {
  return [
    untaxed("2026-01-13", "436050.00"), // D001
    untaxed("2026-07-03", "875000.00"), // D004
    untaxed("2026-07-04", "22500.00"), // D017
    untaxed("2026-07-05", "130000.00"), // D018
    untaxed("2026-07-06", "10000.00"), // D019
    untaxed("2026-07-07", "37500.00"), // D020
    untaxed("2026-07-08", "352500.00"), // D006
    // D021 incentive release — the ONE taxable payment (2026-07-09):
    // gross 50,000 → net 44,642.86 / VAT 5,357.14 / EWT 4,464.29 / net cash 45,535.71.
    {
      net_of_vat: "44642.86",
      net_cash: "45535.71",
      vat_amount: "5357.14",
      ewt_amount: "4464.29",
      year_paid: 2026,
      month_paid: 7,
    },
  ];
}

/** All 21 workbook deals are booked 2026 (WORKBOOK_REFERENCE §3). */
const BOOKED_YEARS_2026 = new Array(21).fill(2026) as number[];

// --- contiguousYearRange (rule 2) -------------------------------------------

test("contiguousYearRange: empty input → empty range (empty workspace)", () => {
  assert.deepEqual(contiguousYearRange([]), []);
  assert.deepEqual(contiguousYearRange([null, null]), []);
});

test("contiguousYearRange: single year → single element", () => {
  assert.deepEqual(contiguousYearRange([2026, 2026, null]), [2026]);
});

test("contiguousYearRange: fills gaps between min and max (booked 2024, cash 2026)", () => {
  // AC8: a 2024 booking with no cash until 2026 → 2024/2025 are zero rows, not gaps.
  assert.deepEqual(contiguousYearRange([2026, 2024]), [2024, 2025, 2026]);
});

test("contiguousYearRange: union of paid + booked, unordered input", () => {
  assert.deepEqual(contiguousYearRange([2028, 2026, 2027]), [2026, 2027, 2028]);
});

// --- Report 1 — Cash Collected per Year (AC1, test plan 1) -------------------

test("Report 1: single 2026 row ties to the workbook anchors; TOTAL identical", () => {
  const report = buildCashPerYear(workbookPayments(), BOOKED_YEARS_2026);

  assert.equal(report.rows.length, 1, "exactly one non-zero year");
  const y2026 = report.rows[0];
  assert.equal(y2026.year, 2026);
  // 436,050 + 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86
  assert.equal(y2026.netOfVat, "1908192.86");
  // net cash swaps D021's 44,642.86 for 45,535.71 (+892.85 EWT-vs-VAT gap)
  assert.equal(y2026.netCash, "1909085.71");
  assert.equal(y2026.outputVat, "5357.14");
  assert.equal(y2026.ewt, "4464.29");
  assert.equal(y2026.payments, 8);

  // TOTAL row identical to the single year row (rule 13 — sum of the payment set).
  assert.equal(report.total.netOfVat, "1908192.86");
  assert.equal(report.total.netCash, "1909085.71");
  assert.equal(report.total.outputVat, "5357.14");
  assert.equal(report.total.ewt, "4464.29");
  assert.equal(report.total.payments, 8);
});

test("Report 1: empty workspace → empty rows, zero TOTAL", () => {
  const report = buildCashPerYear([], []);
  assert.deepEqual(report.rows, []);
  assert.equal(report.total.netOfVat, "0.00");
  assert.equal(report.total.netCash, "0.00");
  assert.equal(report.total.outputVat, "0.00");
  assert.equal(report.total.ewt, "0.00");
  assert.equal(report.total.payments, 0);
});

test("Report 1: booked-2024/no-cash extends the range with zero rows (AC8)", () => {
  // One synthetic deal booked 2024, no payments → rows 2024, 2025, 2026 (contiguous).
  const report = buildCashPerYear(workbookPayments(), [...BOOKED_YEARS_2026, 2024]);
  assert.deepEqual(report.rows.map((r) => r.year), [2024, 2025, 2026]);

  const [y2024, y2025, y2026] = report.rows;
  assert.equal(y2024.netOfVat, "0.00");
  assert.equal(y2024.payments, 0);
  assert.equal(y2025.netOfVat, "0.00");
  assert.equal(y2025.payments, 0);
  assert.equal(y2026.netOfVat, "1908192.86");
  assert.equal(y2026.payments, 8);
  // TOTAL unchanged by the zero rows.
  assert.equal(report.total.netOfVat, "1908192.86");
  assert.equal(report.total.payments, 8);
});

test("Report 1: multi-year synthetic — correct per-year bucketing + range", () => {
  const payments: ReportPayment[] = [
    untaxed("2025-03-10", "100000.00"),
    untaxed("2025-11-02", "50000.00"),
    untaxed("2026-01-13", "436050.00"),
  ];
  const report = buildCashPerYear(payments, [2025, 2026]);
  assert.deepEqual(report.rows.map((r) => r.year), [2025, 2026]);
  assert.equal(report.rows[0].netOfVat, "150000.00");
  assert.equal(report.rows[0].payments, 2);
  assert.equal(report.rows[1].netOfVat, "436050.00");
  assert.equal(report.rows[1].payments, 1);
  assert.equal(report.total.netOfVat, "586050.00");
  assert.equal(report.total.payments, 3);
});

test("Report 1: a paid year with no booking still appears (rule 8, AC7)", () => {
  // A 2027 payment on a 2026-booked deal, no 2027 booking → report 1 gains a 2027 row.
  const payments = [...workbookPayments(), untaxed("2027-03-15", "100000.00")];
  const report = buildCashPerYear(payments, BOOKED_YEARS_2026);
  assert.deepEqual(report.rows.map((r) => r.year), [2026, 2027]);
  assert.equal(report.rows[1].year, 2027);
  assert.equal(report.rows[1].netOfVat, "100000.00");
  assert.equal(report.rows[1].payments, 1);
});

// --- Report 3 — Monthly Cash Flow (AC4, test plan 2) ------------------------

test("Report 3: 2026 — Jan + Jul populated, ten zero months, TOTAL ties", () => {
  const report = buildMonthlyCashFlow(workbookPayments(), 2026);

  assert.equal(report.year, 2026);
  assert.equal(report.rows.length, 12, "all twelve months render (rule 4)");
  assert.deepEqual(report.rows.map((r) => r.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  const jan = report.rows[0];
  assert.equal(jan.netOfVat, "436050.00");
  assert.equal(jan.netCash, "436050.00");

  const jul = report.rows[6];
  // 875,000 + 22,500 + 130,000 + 10,000 + 37,500 + 352,500 + 44,642.86
  assert.equal(jul.netOfVat, "1472142.86");
  assert.equal(jul.netCash, "1473035.71");

  // Feb–Jun and Aug–Dec are present zeros.
  for (const i of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
    assert.equal(report.rows[i].netOfVat, "0.00", `month ${i + 1} net of VAT`);
    assert.equal(report.rows[i].netCash, "0.00", `month ${i + 1} net cash`);
  }

  assert.equal(report.total.netOfVat, "1908192.86");
  assert.equal(report.total.netCash, "1909085.71");
});

test("Report 3: an empty year still renders twelve zero months", () => {
  const report = buildMonthlyCashFlow(workbookPayments(), 2030);
  assert.equal(report.rows.length, 12);
  assert.ok(report.rows.every((r) => r.netOfVat === "0.00" && r.netCash === "0.00"));
  assert.equal(report.total.netOfVat, "0.00");
});

// --- Report 4 — Tax Collected per Month (AC5, test plan 3) ------------------

test("Report 4: 2026 — Jul is the only taxable month; Jan base-only; TOTAL ties", () => {
  const report = buildTaxPerMonth(workbookPayments(), 2026);

  assert.equal(report.year, 2026);
  assert.equal(report.rows.length, 12, "all twelve months render (rule 4)");

  const jan = report.rows[0];
  assert.equal(jan.outputVat, "0.00");
  assert.equal(jan.ewt, "0.00");
  assert.equal(jan.netOfVatBase, "436050.00"); // untaxed resale base still reported
  assert.equal(jan.payments, 1);

  const jul = report.rows[6];
  assert.equal(jul.outputVat, "5357.14"); // D021 incentive release only
  assert.equal(jul.ewt, "4464.29");
  assert.equal(jul.netOfVatBase, "1472142.86");
  assert.equal(jul.payments, 7);

  // Every other month is fully zero.
  for (const i of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
    const r = report.rows[i];
    assert.equal(r.outputVat, "0.00");
    assert.equal(r.ewt, "0.00");
    assert.equal(r.netOfVatBase, "0.00");
    assert.equal(r.payments, 0);
  }

  assert.equal(report.total.outputVat, "5357.14");
  assert.equal(report.total.ewt, "4464.29");
  assert.equal(report.total.netOfVatBase, "1908192.86");
  assert.equal(report.total.payments, 8);
});

// --- FR-M8-14 cross-checks (test plan 11) -----------------------------------

test("Cross-check: report 1 Net-of-VAT ≡ report 3 TOTAL ≡ report 4 base TOTAL (per year)", () => {
  const payments = workbookPayments();
  const r1 = buildCashPerYear(payments, BOOKED_YEARS_2026);
  const r3 = buildMonthlyCashFlow(payments, 2026);
  const r4 = buildTaxPerMonth(payments, 2026);

  const r1y2026 = r1.rows.find((r) => r.year === 2026)!;
  assert.equal(r1y2026.netOfVat, r3.total.netOfVat);
  assert.equal(r1y2026.netOfVat, r4.total.netOfVatBase);
  // Net cash and payment count tie across reports 1 and 3 too.
  assert.equal(r1y2026.netCash, r3.total.netCash);
  assert.equal(r1y2026.payments, r4.total.payments);
});

test("Cross-check: a report 3/4 TOTAL is the decimal sum of its twelve rows (rule 13)", () => {
  // Randomised centavo amounts spread across months, in one year — the TOTAL must
  // equal the full-precision sum of the rows, never a re-sum of display-rounded cells.
  const amounts = ["0.01", "0.02", "0.03", "0.04", "0.05", "0.06", "0.07"];
  const payments: ReportPayment[] = amounts.map((a, i) =>
    untaxed(`2029-0${(i % 9) + 1}-15`, a)
  );
  const r3 = buildMonthlyCashFlow(payments, 2029);
  // 0.01+…+0.07 = 0.28
  assert.equal(r3.total.netOfVat, "0.28");
});
