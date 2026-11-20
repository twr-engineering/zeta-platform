import { getMonthlyCashFlow, getReportYears } from "@/lib/reports/queries";
import { parseYearParam } from "@/lib/reports/params";
import { manilaYear } from "@/lib/date/manila";
import { ReportTabHeader } from "@/components/reports/report-tab-header";
import { ReportEmptyState } from "@/components/reports/report-empty-state";
import { ReportYearSelector } from "@/components/reports/report-year-selector";
import { ReportExport } from "@/components/reports/report-export";
import { MonthlyCashFlowTable } from "@/components/reports/monthly-cash-flow-table";

/**
 * M8.3 — Report 3 tab (Monthly Cash Flow, selected year). Shares the selected-year
 * control with Report 4 (rule 3); default is the current Manila year, options are
 * the rule-2 union range. Always twelve month rows (rule 4). Empty only when the
 * workspace has no years at all (no payments, no deals — rule 14).
 */
export default async function MonthlyCashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const raw = (await searchParams).year;
  const rawYear = Array.isArray(raw) ? raw[0] : raw;
  const parsed = parseYearParam(rawYear ?? null);
  const year = parsed.ok ? parsed.year : manilaYear();

  const [report, years] = await Promise.all([getMonthlyCashFlow(year), getReportYears()]);
  const empty = years.length === 0;

  return (
    <div className="space-y-4">
      <ReportTabHeader
        slug="monthly-cash-flow"
        control={
          !empty && (
            <ReportYearSelector slug="monthly-cash-flow" selected={String(year)} years={years} />
          )
        }
        actions={
          <ReportExport
            dataset="monthly-cash-flow"
            label="Monthly Cash Flow"
            year={year}
            disabled={empty}
          />
        }
      />
      {empty ? <ReportEmptyState /> : <MonthlyCashFlowTable report={report} />}
    </div>
  );
}
