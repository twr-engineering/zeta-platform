/**
 * M8 Collection Reports — the payment-period reports (1, 3, 4). Pure builders and
 * typed shapes live in ./build; the RLS-scoped server reads live in ./queries.
 * M8.2 adds the vintage matrix (report 2) and booking-year summary (report 5);
 * M8.3 consumes these shapes for the Reports UI.
 */
export {
  buildCashPerYear,
  buildMonthlyCashFlow,
  buildTaxPerMonth,
  contiguousYearRange,
  type ReportPayment,
  type CashPerYearRow,
  type CashPerYearTotal,
  type CashPerYearReport,
  type MonthlyCashFlowRow,
  type MonthlyCashFlowReport,
  type TaxPerMonthRow,
  type TaxPerMonthReport,
} from "./build";
