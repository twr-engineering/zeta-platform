import { getTaxPerMonth, getReportYears } from "@/lib/reports/queries";
import { parseYearParam } from "@/lib/reports/params";
import { manilaYear } from "@/lib/date/manila";
import { ReportTabHeader } from "@/components/reports/report-tab-header";
import { ReportEmptyState } from "@/components/reports/report-empty-state";
import { ReportYearSelector } from "@/components/reports/report-year-selector";
import { TaxPerMonthTable } from "@/components/reports/tax-per-month-table";

/**
 * M8.3 — Report 4 tab (Tax Collected per Month, selected year) — the agent's monthly
 * accountant pull. Shares the selected-year control with Report 3 (rule 3); default
 * is the current Manila year. Column captions carry the plain-language tax meanings
 * (FR-M8-07). Always twelve month rows (rule 4). Empty only on an empty workspace.
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

  const [report, years] = await Promise.all([getTaxPerMonth(year), getReportYears()]);
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
      />
      {empty ? <ReportEmptyState /> : <TaxPerMonthTable report={report} />}
    </div>
  );
}
