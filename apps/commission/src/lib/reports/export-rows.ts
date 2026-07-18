import type { ExportColumn, ExportDataset } from "@/lib/export/format";
import { monthName } from "./display";
import type {
  CashPerYearReport,
  MonthlyCashFlowReport,
  TaxPerMonthReport,
  BookingYearSummaryReport,
  VintageMatrix,
} from "./build";

/**
 * M8.4 — the pure flattening of the five Collection Reports into export rows
 * (FR-M8-10). Kept out of the server-only export registry (like yield/export-rows and
 * source-performance/export-rows) so each shape is unit-testable against the §9 anchors
 * with no request.
 *
 * TIES TO THE SCREEN TO THE CENTAVO. Every money cell is the aggregator's exact stored
 * `::text` string (format.ts writes it verbatim to CSV, and parses it once through
 * decimal.js for the XLSX Number) — never re-rounded here. The TOTAL row is appended
 * exactly as the on-screen table pins it (rule 13), so the download reproduces the
 * visible rows including TOTAL, matrix row totals, and — for the matrix — the 0.00 that
 * the grid renders as "—" (the dash is a render-only substitution; exports carry 0.00).
 *
 * The active toggle/year is not carried in a cell but in the FILENAME (the loader sets
 * the dataset name to e.g. `tax-per-month-2026` / `vintage-matrix-net_cash`), matching
 * FR-M8-10's "active toggle/year in the filename".
 */

// --- Report 1 — Cash Collected per Year -------------------------------------

/** A report-1 export row: the Year column is text so the TOTAL row can label itself. */
export type CashPerYearExportRow = {
  year: string;
  netOfVat: string;
  netCash: string;
  outputVat: string;
  ewt: string;
  payments: number;
};

export const CASH_PER_YEAR_COLUMNS: readonly ExportColumn<CashPerYearExportRow>[] = [
  { header: "Year", type: "text", value: (r) => r.year, width: 10 },
  { header: "Net of VAT", type: "money", value: (r) => r.netOfVat, width: 18 },
  { header: "Net Cash", type: "money", value: (r) => r.netCash, width: 18 },
  { header: "Output VAT", type: "money", value: (r) => r.outputVat, width: 16 },
  { header: "EWT", type: "money", value: (r) => r.ewt, width: 16 },
  { header: "# Payments", type: "number", value: (r) => r.payments, width: 12 },
];

export function cashPerYearToRows(report: CashPerYearReport): CashPerYearExportRow[] {
  const rows: CashPerYearExportRow[] = report.rows.map((r) => ({
    year: String(r.year),
    netOfVat: r.netOfVat,
    netCash: r.netCash,
    outputVat: r.outputVat,
    ewt: r.ewt,
    payments: r.payments,
  }));
  rows.push({
    year: "TOTAL",
    netOfVat: report.total.netOfVat,
    netCash: report.total.netCash,
    outputVat: report.total.outputVat,
    ewt: report.total.ewt,
    payments: report.total.payments,
  });
  return rows;
}

// --- Report 3 — Monthly Cash Flow -------------------------------------------

export type MonthlyCashFlowExportRow = {
  month: string;
  netOfVat: string;
  netCash: string;
};

export const MONTHLY_CASH_FLOW_COLUMNS: readonly ExportColumn<MonthlyCashFlowExportRow>[] = [
  { header: "Month", type: "text", value: (r) => r.month, width: 14 },
  { header: "Net of VAT", type: "money", value: (r) => r.netOfVat, width: 18 },
  { header: "Net Cash", type: "money", value: (r) => r.netCash, width: 18 },
];

export function monthlyCashFlowToRows(
  report: MonthlyCashFlowReport
): MonthlyCashFlowExportRow[] {
  const rows: MonthlyCashFlowExportRow[] = report.rows.map((r) => ({
    month: monthName(r.month),
    netOfVat: r.netOfVat,
    netCash: r.netCash,
  }));
  rows.push({ month: "TOTAL", netOfVat: report.total.netOfVat, netCash: report.total.netCash });
  return rows;
}

// --- Report 4 — Tax Collected per Month -------------------------------------

/**
 * Report 4's export headers carry the VERBATIM plain-language BIR captions (FR-M8-07),
 * so the file the accountant opens names each tax column exactly as the screen does.
 */
export type TaxPerMonthExportRow = {
  month: string;
  outputVat: string;
  ewt: string;
  netOfVatBase: string;
  payments: number;
};

export const TAX_PER_MONTH_COLUMNS: readonly ExportColumn<TaxPerMonthExportRow>[] = [
  { header: "Month", type: "text", value: (r) => r.month, width: 14 },
  { header: "Output VAT — to remit to BIR", type: "money", value: (r) => r.outputVat, width: 26 },
  {
    header: "EWT withheld — creditable, BIR Form 2307",
    type: "money",
    value: (r) => r.ewt,
    width: 34,
  },
  { header: "Net of VAT (base)", type: "money", value: (r) => r.netOfVatBase, width: 18 },
  { header: "# Payments", type: "number", value: (r) => r.payments, width: 12 },
];

export function taxPerMonthToRows(report: TaxPerMonthReport): TaxPerMonthExportRow[] {
  const rows: TaxPerMonthExportRow[] = report.rows.map((r) => ({
    month: monthName(r.month),
    outputVat: r.outputVat,
    ewt: r.ewt,
    netOfVatBase: r.netOfVatBase,
    payments: r.payments,
  }));
  rows.push({
    month: "TOTAL",
    outputVat: report.total.outputVat,
    ewt: report.total.ewt,
    netOfVatBase: report.total.netOfVatBase,
    payments: report.total.payments,
  });
  return rows;
}

// --- Report 5 — Booking-Year Summary ----------------------------------------

export type BookingYearSummaryExportRow = {
  year: string;
  deals: number;
  gci: string;
  collected: string;
  outstanding: string;
  writtenOff: string;
};

export const BOOKING_YEAR_SUMMARY_COLUMNS: readonly ExportColumn<BookingYearSummaryExportRow>[] = [
  { header: "Booking year", type: "text", value: (r) => r.year, width: 14 },
  { header: "Deals", type: "number", value: (r) => r.deals, width: 8 },
  { header: "GCI (Net of VAT)", type: "money", value: (r) => r.gci, width: 18 },
  { header: "Collected", type: "money", value: (r) => r.collected, width: 18 },
  { header: "Outstanding", type: "money", value: (r) => r.outstanding, width: 18 },
  // The OQ4 split: Written-off is its own column (Outstanding is open balances only) —
  // the deliberate sheet departure the on-screen table marks with ⚑.
  { header: "Written off", type: "money", value: (r) => r.writtenOff, width: 16 },
];

export function bookingYearSummaryToRows(
  report: BookingYearSummaryReport
): BookingYearSummaryExportRow[] {
  const rows: BookingYearSummaryExportRow[] = report.rows.map((r) => ({
    year: String(r.year),
    deals: r.deals,
    gci: r.gci,
    collected: r.collected,
    outstanding: r.outstanding,
    writtenOff: r.writtenOff,
  }));
  rows.push({
    year: "TOTAL",
    deals: report.total.deals,
    gci: report.total.gci,
    collected: report.total.collected,
    outstanding: report.total.outstanding,
    writtenOff: report.total.writtenOff,
  });
  return rows;
}

// --- Report 2 — Vintage Matrix (dynamic columns) ----------------------------

/**
 * A matrix export row: the paid-year label, one money cell per booking-year column
 * (index-aligned with the matrix's `bookedYears`), and the row total. Zero cells are
 * "0.00" (the export carries the zero the grid renders as "—").
 */
export type VintageMatrixExportRow = {
  label: string;
  cells: string[];
  total: string;
};

/**
 * The matrix is the one report whose columns are DATA (the booking years), so its
 * ExportDataset is built here rather than declared as a static column list. Columns:
 * the paid-year axis label, one per booking year, then the Row total. Rows: one per
 * paid year, then the TOTAL row (the column totals + grand total). `name` embeds the
 * active toggle value so the filename labels the view (FR-M8-04/10).
 */
export function vintageMatrixToDataset(
  matrix: VintageMatrix,
  name: string
): ExportDataset<unknown> {
  const columns: ExportColumn<VintageMatrixExportRow>[] = [
    { header: "Year Paid", type: "text", value: (r) => r.label, width: 14 },
    ...matrix.bookedYears.map(
      (by, i): ExportColumn<VintageMatrixExportRow> => ({
        header: String(by),
        type: "money",
        value: (r) => r.cells[i] ?? "0.00",
        width: 16,
      })
    ),
    { header: "Row total", type: "money", value: (r) => r.total, width: 16 },
  ];

  const rows: VintageMatrixExportRow[] = [
    ...matrix.rows.map((r) => ({
      label: String(r.yearPaid),
      cells: r.cells,
      total: r.total,
    })),
    { label: "TOTAL", cells: matrix.columnTotals, total: matrix.grandTotal },
  ];

  return { name, sheet: "Vintage Matrix", columns, rows } as unknown as ExportDataset<unknown>;
}
