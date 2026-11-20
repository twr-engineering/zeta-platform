import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCashPerYear,
  buildMonthlyCashFlow,
  buildTaxPerMonth,
  buildVintageMatrix,
  buildBookingYearSummary,
  type ReportPayment,
  type MatrixPayment,
  type ReportReceivable,
} from "../../../src/lib/reports/build.ts";
import {
  cashPerYearToRows,
  CASH_PER_YEAR_COLUMNS,
  monthlyCashFlowToRows,
  taxPerMonthToRows,
  TAX_PER_MONTH_COLUMNS,
  bookingYearSummaryToRows,
  BOOKING_YEAR_SUMMARY_COLUMNS,
  vintageMatrixToDataset,
} from "../../../src/lib/reports/export-rows.ts";
import type { ExportColumn } from "../../../src/lib/export/format.ts";

/**
 * M8.4 — the Collection Reports export flatten (FR-M8-10 / AC10). The flatten never
 * recomputes: it maps each report's rows + pinned TOTAL into export rows, preserving
 * every ₱ string verbatim (format.ts writes it to CSV / parses once for XLSX). These
 * prove the download ties to the on-screen table to the centavo — including the TOTAL
 * row, report 4's verbatim BIR caption headers, and the matrix's 0.00 (the export
 * carries the zero the grid renders as "—").
 *
 * Two workbook-faithful payments anchor the money: D001 (Jan, untaxed resale) and
 * D021 (Jul, taxable incentive release) — the split the §9 fixture is built on.
 */

const D001: ReportPayment = {
  net_of_vat: "436050.00",
  net_cash: "436050.00",
  vat_amount: "0.00",
  ewt_amount: "0.00",
  year_paid: 2026,
  month_paid: 1,
};
const D021: ReportPayment = {
  net_of_vat: "44642.86",
  net_cash: "45535.71",
  vat_amount: "5357.14",
  ewt_amount: "4464.29",
  year_paid: 2026,
  month_paid: 7,
};
const PAYMENTS: ReportPayment[] = [D001, D021];

/** The value a column's writer emits for a row. */
function cell<Row>(columns: readonly ExportColumn<Row>[], row: Row, header: string): unknown {
  const col = columns.find((c) => c.header === header);
  assert.ok(col, `column "${header}" exists`);
  return col!.value(row);
}

test("Report 1 flatten: one row per year + a TOTAL row, money verbatim", () => {
  const rows = cashPerYearToRows(buildCashPerYear(PAYMENTS, [2026]));
  // 2026 data row + TOTAL.
  assert.equal(rows.length, 2);
  const y = rows[0];
  assert.equal(y.year, "2026");
  assert.equal(y.netOfVat, "480692.86"); // 436050.00 + 44642.86
  assert.equal(y.outputVat, "5357.14");
  assert.equal(y.ewt, "4464.29");
  assert.equal(y.payments, 2);

  const total = rows[rows.length - 1];
  assert.equal(total.year, "TOTAL");
  assert.equal(total.netOfVat, "480692.86");
  assert.equal(total.payments, 2);
  // The column writer passes the money string through untouched (format.ts formats).
  assert.equal(cell(CASH_PER_YEAR_COLUMNS, total, "Net of VAT"), "480692.86");
});

test("Report 3 flatten: all twelve months present + TOTAL, months spelled out", () => {
  const rows = monthlyCashFlowToRows(buildMonthlyCashFlow(PAYMENTS, 2026));
  assert.equal(rows.length, 13); // 12 months + TOTAL
  assert.equal(rows[0].month, "January");
  assert.equal(rows[0].netOfVat, "436050.00");
  assert.equal(rows[6].month, "July");
  assert.equal(rows[6].netOfVat, "44642.86");
  // A zero month is present, not missing (rule 4).
  assert.equal(rows[1].month, "February");
  assert.equal(rows[1].netOfVat, "0.00");
  assert.equal(rows[12].month, "TOTAL");
  assert.equal(rows[12].netOfVat, "480692.86");
});

test("Report 4 flatten: verbatim BIR caption headers + TOTAL, Jul split anchors", () => {
  // The plain-language captions the accountant reads (FR-M8-07), verbatim.
  assert.deepEqual(
    TAX_PER_MONTH_COLUMNS.map((c) => c.header),
    [
      "Month",
      "Output VAT — to remit to BIR",
      "EWT withheld — creditable, BIR Form 2307",
      "Net of VAT (base)",
      "# Payments",
    ]
  );

  const rows = taxPerMonthToRows(buildTaxPerMonth(PAYMENTS, 2026));
  assert.equal(rows.length, 13);
  const jul = rows[6];
  assert.equal(jul.month, "July");
  assert.equal(jul.outputVat, "5357.14");
  assert.equal(jul.ewt, "4464.29");
  assert.equal(jul.netOfVatBase, "44642.86");
  assert.equal(jul.payments, 1);

  const jan = rows[0];
  assert.equal(jan.outputVat, "0.00");
  assert.equal(jan.netOfVatBase, "436050.00");
  assert.equal(jan.payments, 1);

  const total = rows[12];
  assert.equal(total.month, "TOTAL");
  assert.equal(total.outputVat, "5357.14");
  assert.equal(total.ewt, "4464.29");
  assert.equal(total.netOfVatBase, "480692.86");
  assert.equal(total.payments, 2);
});

test("Report 2 flatten: columns are the booking years, zero cells carry 0.00, TOTAL row", () => {
  // A payment paid 2026 on a 2026 deal, and a booking year 2025 with no cash → a
  // 2025 column with an all-zero body (AC8). Zero cells must export "0.00", not "—".
  const matrixPayments: MatrixPayment[] = [
    { net_of_vat: "44642.86", net_cash: "45535.71", year_paid: 2026, booked_year: 2026 },
  ];
  const matrix = buildVintageMatrix(matrixPayments, [2025, 2026], "net_of_vat");
  const ds = vintageMatrixToDataset(matrix, "vintage-matrix-net_of_vat");

  assert.equal(ds.name, "vintage-matrix-net_of_vat");
  // Columns: Year Paid, 2025, 2026, Row total.
  assert.deepEqual(
    ds.columns.map((c) => c.header),
    ["Year Paid", "2025", "2026", "Row total"]
  );

  // The 2026 paid row + the TOTAL row.
  assert.equal(ds.rows.length, 2);
  const paidRow = ds.rows[0] as { label: string };
  assert.equal(paidRow.label, "2026");
  // The 2025 column (no cash) exports 0.00; the 2026 column carries the cash.
  assert.equal(cell(ds.columns, ds.rows[0], "2025"), "0.00");
  assert.equal(cell(ds.columns, ds.rows[0], "2026"), "44642.86");
  assert.equal(cell(ds.columns, ds.rows[0], "Row total"), "44642.86");

  const totalRow = ds.rows[1] as { label: string };
  assert.equal(totalRow.label, "TOTAL");
  assert.equal(cell(ds.columns, ds.rows[1], "2026"), "44642.86");
  assert.equal(cell(ds.columns, ds.rows[1], "Row total"), "44642.86");
});

test("Report 5 flatten: Written-off is its own column (OQ4 split) + TOTAL row", () => {
  const receivables: ReportReceivable[] = [
    {
      booked_year: 2026,
      status: "open",
      booked_net_gci: "6688497.25",
      collected_net: "1908192.86",
      balance: "4855304.39",
      written_off: null,
    },
    {
      booked_year: 2026,
      status: "cancelled",
      booked_net_gci: "100000.00",
      collected_net: "30000.00",
      balance: null,
      written_off: "70000.00",
    },
  ];
  const rows = bookingYearSummaryToRows(buildBookingYearSummary(receivables, [2026]));
  // Written-off is a distinct column, not folded into Outstanding.
  assert.ok(BOOKING_YEAR_SUMMARY_COLUMNS.some((c) => c.header === "Written off"));

  const y = rows[0];
  assert.equal(y.year, "2026");
  assert.equal(y.deals, 2);
  assert.equal(y.outstanding, "4855304.39"); // open balance only
  assert.equal(y.writtenOff, "70000.00"); // cancelled write-off, split out

  const total = rows[rows.length - 1];
  assert.equal(total.year, "TOTAL");
  assert.equal(total.outstanding, "4855304.39");
  assert.equal(total.writtenOff, "70000.00");
});
