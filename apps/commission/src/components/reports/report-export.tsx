import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { exportPath } from "@/lib/routes";
import type { MatrixValue } from "@/lib/reports";

/**
 * M8.4 — the CSV/XLSX download pair every report tab carries (FR-M8-10, §6). The
 * server builds the file (the download endpoint behind /api/export/<dataset>); this
 * is just the two links, carrying the tab's active year (reports 3 & 4) or matrix
 * value toggle (report 2) so the download matches what is on screen, and the filename
 * carries it (FR-M8-10).
 *
 * EMPTY REPORTS (§6): the buttons render disabled with a tooltip rather than
 * vanishing, so the affordance stays discoverable — there is simply nothing to pull
 * until the first collection is logged.
 */
export function ReportExport({
  dataset,
  label,
  year,
  value,
  disabled = false,
}: {
  /** The export registry name (e.g. "tax-per-month"). */
  dataset: string;
  /** Human label for the aria-label / tooltip (e.g. "Tax per Month"). */
  label: string;
  /** Reports 3 & 4: the selected year, appended so the download matches the screen. */
  year?: number;
  /** Report 2: the active toggle value, appended so the download matches the view. */
  value?: MatrixValue;
  /** True on an empty workspace — the buttons disable with a tooltip. */
  disabled?: boolean;
}) {
  const href = (format: "csv" | "xlsx") => {
    let url = exportPath(dataset, format);
    if (year !== undefined) url += `&year=${year}`;
    // net_of_vat is the default view — leave it off so the default URL stays clean.
    if (value && value !== "net_of_vat") url += `&value=${value}`;
    return url;
  };

  if (disabled) {
    return (
      <div className="flex gap-2" data-testid={`report-export-${dataset}`}>
        {(["csv", "xlsx"] as const).map((format) => (
          <Tooltip key={format}>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  data-testid={`export-${dataset}-${format}`}
                  aria-label={`Export ${label} as ${format.toUpperCase()} (nothing to export yet)`}
                >
                  <Download className="size-4" /> {format.toUpperCase()}
                </Button>
              }
            />
            <TooltipContent>Nothing to export yet.</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2" data-testid={`report-export-${dataset}`}>
      {(["csv", "xlsx"] as const).map((format) => (
        <Button
          key={format}
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={href(format)} />}
          data-testid={`export-${dataset}-${format}`}
          aria-label={`Export ${label} as ${format.toUpperCase()}`}
        >
          <Download className="size-4" /> {format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
