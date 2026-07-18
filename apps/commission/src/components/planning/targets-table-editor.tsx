"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { deletePlanYearTarget } from "@/lib/planning/actions";
import { formatPHP, formatRateAsPercent, formatYield } from "@/lib/money";
import type { PlanYearTarget } from "@/types/entities";
import { EditTargetGate } from "./edit-target-gate";

/**
 * M3.3 §6 targets-table editor: every PlanYearTarget row at once (the workbook's
 * `TargetTable`), columns NIT / Opex % / CoS % / Yield / Avg Price. A blank cell renders
 * the default/all-time value in placeholder styling — the sheet's blank-means-default
 * made visible (rule 3/10). Each row edits through the shared gated modal; "Add a year"
 * appends one (FR-M3-01). Scrolls horizontally at 360 px.
 */
export function TargetsTableEditor({
  targets,
  allTimeYieldPct,
  allTimePricePlaceholder,
}: {
  targets: PlanYearTarget[];
  allTimeYieldPct: string | null;
  allTimePricePlaceholder: string | null;
}) {
  const nextYear = targets.length ? Math.max(...targets.map((t) => t.year)) + 1 : new Date().getFullYear();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Stage future years early — a year needs a Net Income Target to become plannable.
        </p>
        <EditTargetGate
          year={nextYear}
          row={null}
          allTimeYieldPct={allTimeYieldPct}
          allTimePricePlaceholder={allTimePricePlaceholder}
          yearEditable
          testId="targets-add-gate"
          title="Add a planning year"
          description="Create a new year's target row. Leave the Net Income Target blank to stage it without a plan yet."
          trigger={
            <Button variant="outline" size="sm" data-testid="targets-add">
              <Plus className="size-3.5" /> Add a year
            </Button>
          }
        />
      </div>

      <div className="overflow-x-auto rounded-xl border ring-1 ring-foreground/5">
        <table className="w-full min-w-[640px] text-sm" data-testid="targets-table">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Year</th>
              <th className="px-3 py-2 text-right font-medium">Net Income Target</th>
              <th className="px-3 py-2 text-right font-medium">Opex %</th>
              <th className="px-3 py-2 text-right font-medium">CoS %</th>
              <th className="px-3 py-2 text-right font-medium">Yield</th>
              <th className="px-3 py-2 text-right font-medium">Avg Price</th>
              <th className="px-3 py-2 text-right font-medium">Edit</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.year} className="border-b last:border-0" data-testid={`targets-row-${t.year}`}>
                <th scope="row" className="px-3 py-2 text-left font-medium tabular-nums">
                  {t.year}
                </th>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`targets-nit-${t.year}`}>
                  {t.net_income_target ? (
                    formatPHP(t.net_income_target)
                  ) : (
                    <span className="text-muted-foreground italic">not set</span>
                  )}
                </td>
                <Placeholder value={t.opex_pct ? formatRateAsPercent(t.opex_pct) : null} fallback="22% (default)" />
                <Placeholder value={t.cos_pct ? formatRateAsPercent(t.cos_pct) : null} fallback="10% (default)" />
                <Placeholder value={t.yield_override ? formatYield(t.yield_override) : null} fallback="all-time" />
                <Placeholder
                  value={t.avg_price_override ? formatPHP(t.avg_price_override) : null}
                  fallback="all-time"
                />
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <EditTargetGate
                      year={t.year}
                      row={t}
                      allTimeYieldPct={allTimeYieldPct}
                      allTimePricePlaceholder={allTimePricePlaceholder}
                      testId={`targets-edit-gate-${t.year}`}
                      title={`Edit plan targets for ${t.year}`}
                      description="Update this year's targets and cost assumptions."
                      trigger={
                        <Button variant="ghost" size="sm" data-testid={`targets-edit-${t.year}`} aria-label={`Edit ${t.year}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                      }
                    />
                    <ConfirmGate
                      testId={`targets-delete-gate-${t.year}`}
                      destructive
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          data-testid={`targets-delete-${t.year}`}
                          aria-label={`Remove ${t.year}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      }
                      title={`Remove the ${t.year} planning target`}
                      description={`${t.year} will have no plan and no dashboard target.`}
                      consequence="The change is audit-logged."
                      gate={{ mode: "checked" }}
                      confirmLabel="Remove year"
                      action={deletePlanYearTarget}
                    >
                      <input type="hidden" name="year" value={t.year} />
                    </ConfirmGate>
                  </div>
                </td>
              </tr>
            ))}
            {targets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No planning years yet — add one to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Placeholder({ value, fallback }: { value: string | null; fallback: string }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      {value ? value : <span className="text-muted-foreground italic">{fallback}</span>}
    </td>
  );
}
