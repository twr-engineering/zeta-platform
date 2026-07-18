import { reportTabBySlug, type ReportTabSlug } from "@/lib/reports/tabs";

/**
 * M8.3 — the per-tab title + description block, with an optional slot for the tab's
 * interactive control (the shared year selector for reports 3/4, the value toggle
 * for the matrix). Reads the copy from the single REPORT_TABS source so a tab's
 * heading matches its nav label.
 */
export function ReportTabHeader({
  slug,
  caption,
  control,
  actions,
}: {
  slug: ReportTabSlug;
  /** An extra line under the description — e.g. the matrix reading guide (verbatim). */
  caption?: React.ReactNode;
  /** The tab's control (year selector / value toggle), floated right on wide screens. */
  control?: React.ReactNode;
  /** The tab's export/print buttons, in the same right-hand cluster as the control. */
  actions?: React.ReactNode;
}) {
  const tab = reportTabBySlug(slug);
  if (!tab) return null;

  return (
    // `no-print` keeps the whole heading (title, description, controls, export/print
    // buttons) off the printed page — the print layout supplies its own header block.
    <div className="no-print flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight" data-testid="report-title">
          {tab.title}
        </h2>
        <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
          {tab.description}
        </p>
        {caption && (
          <p className="mt-1 text-sm text-muted-foreground" data-testid="report-caption">
            {caption}
          </p>
        )}
      </div>
      {(control || actions) && (
        // No `shrink-0`: a shrink-0 flex-wrap cluster takes its max-content width (year
        // selector + export + print ≈ 400px) and never wraps, overflowing 360px. Letting
        // it shrink lets the controls wrap within the viewport (as source-performance does).
        <div className="flex flex-wrap items-center gap-3">
          {control}
          {actions}
        </div>
      )}
    </div>
  );
}
