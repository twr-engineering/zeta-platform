import "server-only";

import { createClient } from "@/lib/supabase/server";
import { manilaYear } from "@/lib/date/manila";
import { listPayments } from "@/lib/payments/queries";
import { listReceivables } from "@/lib/receivables/queries";
import {
  buildCashPerYear,
  buildMonthlyCashFlow,
  buildTaxPerMonth,
  buildVintageMatrix,
  buildBookingYearSummary,
  contiguousYearRange,
  type CashPerYearReport,
  type MonthlyCashFlowReport,
  type TaxPerMonthReport,
  type MatrixValue,
  type MatrixPayment,
  type VintageMatrix,
  type BookingYearSummaryReport,
} from "./build";

/**
 * M8.1 — the server reads behind the three payment-period reports (1, 3, 4). Each
 * loads the RLS-scoped rows ONCE and hands them to the pure builders in ./build. No
 * `workspace_id` filter and no `workspaceId` param anywhere: RLS is the tenant
 * boundary (M0 rule 1 / AC9), the same discipline as every query file — accepting a
 * workspace id would be the isolation footgun the doctrine warns against.
 *
 * COMPUTE-ON-READ (§8, M6/M7 precedent). These read straight through listPayments
 * (active payments only — rule 12) and the active booked years; there is no
 * materialized cache, so a payment logged in M5 is visible on the very next read
 * (0 s staleness, FR-M8-13). The whole read is a GROUP BY over indexed period
 * columns well inside the < 1 s bar; M8.4 layers cache + invalidation on top only if
 * the perf fixture ever threatens it.
 *
 * WHY listPayments IS REUSED. The dashboard (M6.1) already reads the active payment
 * ledger through it and casts to its section-payment shape; a PaymentRow satisfies
 * ReportPayment structurally (the same stored ::text split + generated
 * year_paid/month_paid). Reports 1/3/4 ignore the joined deal identity entirely —
 * they aggregate the stored snapshot (rule 5) — so no deal money crosses this seam.
 */

/**
 * The active booked years present in the workspace (rule 2's range union input). A
 * light select of the one integer column over non-archived deals — a booking with
 * no cash still extends report 1's range to a visible zero row (AC8). RLS-scoped.
 */
async function activeBookedYears(): Promise<number[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal")
    .select("booked_year")
    .is("archived_at", null)
    .returns<{ booked_year: number }[]>();

  if (error) throw new Error(`Could not read your deals: ${error.message}`);
  return (data ?? []).map((d) => d.booked_year);
}

/**
 * Report 1 (§3.2 / FR-M8-02) — Cash Collected per Year, all-time. Rows span the
 * contiguous union of paid + booked years; the TOTAL ties to the rows to the centavo.
 */
export async function getCashPerYear(): Promise<CashPerYearReport> {
  const [payments, bookedYears] = await Promise.all([
    listPayments(),
    activeBookedYears(),
  ]);
  return buildCashPerYear(payments, bookedYears);
}

/**
 * Report 3 (§3.4 / FR-M8-06) — Monthly Cash Flow for a selected paid year (default:
 * the current Manila year, rule 3). Always twelve month rows.
 */
export async function getMonthlyCashFlow(
  year: number = manilaYear()
): Promise<MonthlyCashFlowReport> {
  return buildMonthlyCashFlow(await listPayments(), year);
}

/**
 * Report 4 (§3.5 / FR-M8-07) — Tax Collected per Month for a selected paid year
 * (default: the current Manila year, rule 3) — the agent's monthly accountant pull.
 * Always twelve month rows.
 */
export async function getTaxPerMonth(
  year: number = manilaYear()
): Promise<TaxPerMonthReport> {
  return buildTaxPerMonth(await listPayments(), year);
}

/**
 * Report 2 (§3.3 / FR-M8-03/04) — the paid-year × booking-year vintage matrix for the
 * chosen toggle value (default Net of VAT). The row axis comes from the payments'
 * paid years; the column axis from ALL active deals' booking years (so a booked-but-
 * uncollected year is still a column, AC8). The payment→deal booking year is joined
 * LIVE (rule 6): the matrix reads deal.booked_year off the current payment join, so a
 * corrected booked date re-vintages the cash — while the money splits stay snapshot
 * (rule 5). A dangling payment (no resolvable deal) makes the builder throw (rule 15),
 * which the route turns into a 500 — M8 never silently drops real cash.
 */
export async function getVintageMatrix(
  value: MatrixValue = "net_of_vat"
): Promise<VintageMatrix> {
  const [payments, bookedYears] = await Promise.all([
    listPayments(),
    activeBookedYears(),
  ]);
  // Flatten the live-joined deal booking year onto each payment; a null deal (dangling
  // reference) becomes a null booked_year, which buildVintageMatrix rejects loudly.
  const matrixPayments: MatrixPayment[] = payments.map((p) => ({
    net_of_vat: p.net_of_vat,
    net_cash: p.net_cash,
    year_paid: p.year_paid,
    booked_year: p.deal?.booked_year ?? null,
  }));
  return buildVintageMatrix(matrixPayments, bookedYears, value);
}

/**
 * Report 5 (§3.6 / FR-M8-08) — the Booking-Year Summary over deals + receivables:
 * per booking year Deals / GCI (Σ net_gci) / Collected (Σ receivable.collected) /
 * Outstanding (Σ open balance) / Written-off (Σ cancelled write-off — the OQ4 split,
 * master PRD Q18 "Split, flagged as sheet departure"). Rows span the contiguous union
 * of booked + paid years (rule 2), so a paid-only year appears as a Deals-0 row (AC7)
 * and a booked-but-uncollected year as a zero-money row (AC8). Reads receivables (the
 * M4 engine's earned/collected/outstanding) and the payment paid years for the range;
 * no payment money crosses this seam. Collected TOTAL ties to report 1 (FR-M8-14).
 */
export async function getBookingYearSummary(): Promise<BookingYearSummaryReport> {
  const [receivables, payments] = await Promise.all([
    listReceivables(),
    listPayments(),
  ]);
  return buildBookingYearSummary(
    receivables,
    payments.map((p) => p.year_paid)
  );
}

/**
 * The selectable year range for reports 3 & 4's shared selector (rule 2/3): the
 * contiguous union of paid + booked years, ascending. Empty on an empty workspace.
 * The M8.3 dropdown offers exactly these; the default selection is the current year.
 */
export async function getReportYears(): Promise<number[]> {
  const [payments, bookedYears] = await Promise.all([
    listPayments(),
    activeBookedYears(),
  ]);
  return contiguousYearRange([
    ...payments.map((p) => p.year_paid),
    ...bookedYears,
  ]);
}
