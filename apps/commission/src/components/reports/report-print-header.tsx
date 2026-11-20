/**
 * M8.4 — the print-only header block for Report 4 (FR-M8-11). Hidden on screen
 * (`print-only`), shown only on the printed page: the workspace name, the report
 * title, the selected year, and the generated-on date — the identifying block the
 * accountant needs on the page the agent hands over. The figures below it are the
 * ordinary report table; the print stylesheet fits both onto one portrait page.
 */
export function ReportPrintHeader({
  workspaceName,
  title,
  year,
  generatedOn,
}: {
  workspaceName: string;
  title: string;
  year: number;
  generatedOn: string;
}) {
  return (
    <div
      className="print-only mb-4 border-b border-black pb-2"
      data-testid="report-print-header"
    >
      <div className="text-lg font-semibold">{workspaceName}</div>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span>
          {title} — {year}
        </span>
        <span>Generated {generatedOn}</span>
      </div>
    </div>
  );
}
