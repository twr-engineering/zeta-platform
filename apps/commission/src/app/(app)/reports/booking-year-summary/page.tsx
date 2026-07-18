import { getBookingYearSummary } from "@/lib/reports/queries";
import { ReportTabHeader } from "@/components/reports/report-tab-header";
import { ReportEmptyState } from "@/components/reports/report-empty-state";
import { BookingYearSummaryTable } from "@/components/reports/booking-year-summary-table";

/**
 * M8.3 — Report 5 tab (Booking-Year Summary, all-time). Deal/receivable-driven, not
 * payment-driven, so its empty state points at the Deal Log. Renders the OQ4-split
 * Written-off column marked as a deliberate sheet departure. Empty when the
 * workspace has no booked or paid years (rule 14).
 */
export default async function BookingYearSummaryPage() {
  const report = await getBookingYearSummary();
  const empty = report.rows.length === 0;

  return (
    <div className="space-y-4">
      <ReportTabHeader slug="booking-year-summary" />
      {empty ? (
        <ReportEmptyState source="deals" />
      ) : (
        <BookingYearSummaryTable report={report} />
      )}
    </div>
  );
}
