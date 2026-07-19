"use client";

/**
 * M10.1 — the legend "?" explainer (FR-M10-10, PRD §6.2, rule 14).
 *
 * The canonical input-vs-computed legend as a popover: the verbatim sheet legend
 * plus the three product affordances (Input / Computed / Linked). This is the "?"
 * that belongs on every table/form header across M1–M9 (the cross-module sweep is
 * M10.4) — a single component so the explainer copy is identical everywhere. The
 * legend COMPONENT (blue input / locked computed) is M0's; M10 owns this explainer
 * and the spec (docs/LEGEND-SPEC.md).
 */
import { HelpPopover } from "./help-popover";
import { cn } from "@/lib/utils";

export function LegendExplainer({
  className,
  testId = "legend-explainer",
}: {
  className?: string;
  testId?: string;
}) {
  return (
    <HelpPopover
      placement="legend.explainer"
      label="About the input-vs-computed legend"
      side="bottom"
      triggerClassName={cn(className)}
      testId={testId}
    />
  );
}
