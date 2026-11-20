import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A numbered dashboard section (M6 §6 — the single scrollable page in the sheet's
 * 1→8 order). Each section carries the workbook's own number + title so the screen
 * reads as the spreadsheet the agent already knows. A `description` renders under
 * the title; `action` sits at the top-right (e.g. a drill-down "View all" link).
 */
export type DashboardSectionProps = {
  index: number;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  testId?: string;
};

export function DashboardSection({
  index,
  title,
  description,
  action,
  children,
  className,
  id,
  testId,
}: DashboardSectionProps) {
  return (
    <section id={id} data-testid={testId} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
            {/* The workbook's own section number (its 1→8 order) as a small
                gold-marked badge — the brand accent where a real sequence lives.
                Emerald numeral on pale gold clears AA (8.7:1). */}
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-muted font-sans text-xs font-semibold tabular-nums text-primary ring-1 ring-gold-border/60 ring-inset"
            >
              {index}
            </span>
            {title}
          </h2>
          {description && (
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
