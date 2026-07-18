import "server-only";

import { createClient } from "@/lib/supabase/server";
import { manilaYear } from "@/lib/date/manila";
import { listPayments } from "@/lib/payments/queries";
import {
  buildCashPerYear,
  buildMonthlyCashFlow,
  buildTaxPerMonth,
  contiguousYearRange,
  type CashPerYearReport,
  type MonthlyCashFlowReport,
  type TaxPerMonthReport,
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
