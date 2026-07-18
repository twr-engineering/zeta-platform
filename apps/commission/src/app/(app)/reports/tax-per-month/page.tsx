import { getTaxPerMonth, getReportYears } from "@/lib/reports/queries";
import { parseYearParam } from "@/lib/reports/params";
import { manilaYear, manilaToday } from "@/lib/date/manila";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { ReportTabHeader } from "@/components/reports/report-tab-header";
import { ReportEmptyState } from "@/components/reports/report-empty-state";
import { ReportYearSelector } from "@/components/reports/report-year-selector";
import { ReportExport } from "@/components/reports/report-export";
import { PrintButton } from "@/components/reports/print-button";
import { ReportPrintHeader } from "@/components/reports/report-print-header";
import { TaxPerMonthTable } from "@/components/reports/tax-per-month-table";

/**
 * M8.3/M8.4 — Report 4 tab (Tax Collected per Month, selected year) — the agent's
 * monthly accountant pull. Shares the selected-year control with Report 3 (rule 3);
 * default is the current Manila year. Column captions carry the plain-language tax
 * meanings (FR-M8-07). Always twelve month rows (rule 4). Empty only on an empty
 * workspace.
 *
 * M8.4 adds the hand-off tooling: CSV/XLSX export (filename carries the year) and a
 * Print button that lays the twelve months + TOTAL onto one portrait page under a
 * header block (workspace · report · year · generated-on) via the print stylesheet.
 */
export default async function TaxPerMonthPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const raw = (await searchParams).year;
  const rawYear = Array.isArray(raw) ? raw[0] : raw;
  const parsed = parseYearParam(rawYear ?? null);
  const year = parsed.ok ? parsed.year : manilaYear();

  const [report, years, context] = await Promise.all([
    getTaxPerMonth(year),
    getReportYears(),
    getWorkspaceContext(),
  ]);
  const empty = years.length === 0;

  return (
    <div className="space-y-4">
      <ReportTabHeader
        slug="tax-per-month"
        control={
          !empty && (
            <ReportYearSelector slug="tax-per-month" selected={String(year)} years={years} />
          )
        }
        actions={
          <>
            <ReportExport dataset="tax-per-month" label="Tax per Month" year={year} disabled={empty} />
            {!empty && <PrintButton />}
          </>
        }
      />
      {empty ? (
        <ReportEmptyState />
      ) : (
        // The printable region: the print header (shown only on paper) + the report
        // table. The print stylesheet lifts this to the page origin (FR-M8-11).
        <div className="report-print-area">
          <ReportPrintHeader
            workspaceName={context?.workspace.name ?? "Workspace"}
            title="Tax Collected per Month"
            year={year}
            generatedOn={manilaToday()}
          />
          <TaxPerMonthTable report={report} />
        </div>
      )}
    </div>
  );
}
