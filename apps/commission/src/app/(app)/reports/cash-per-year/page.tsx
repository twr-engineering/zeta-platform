import { getCashPerYear } from "@/lib/reports/queries";
import { ReportTabHeader } from "@/components/reports/report-tab-header";
import { ReportEmptyState } from "@/components/reports/report-empty-state";
import { CashPerYearTable } from "@/components/reports/cash-per-year-table";

/**
 * M8.3 — Report 1 tab (Cash Collected per Year, all-time). Server-rendered from the
 * M8.1 aggregator; the UI computes nothing. Empty when the workspace has neither a
 * paid nor a booked year (rule 14).
 */
export default async function CashPerYearPage() {
  const report = await getCashPerYear();
  const empty = report.rows.length === 0;

  return (
    <div className="space-y-4">
      <ReportTabHeader slug="cash-per-year" />
      {empty ? <ReportEmptyState /> : <CashPerYearTable report={report} />}
    </div>
  );
}
