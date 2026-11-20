"use client";

import { Pencil } from "lucide-react";

import { LockedValue } from "@/components/affordance/locked-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPHP, formatRateAsPercent } from "@/lib/money";
import type { EconomicModel } from "@/lib/planning";
import type { PlanYearTarget } from "@/types/entities";
import { EditTargetGate } from "./edit-target-gate";

/**
 * M3.3 §6 economic-model card: NIT / Opex / CoS (blue targets, edited via the gate,
 * with "default" badges when unset) → net income % (locked) → the working GCI goal
 * LARGE with its round-up badge, the raw target struck-small beneath it (FR-M3-04).
 * Every computed figure is a LockedValue with a plain-language formula tooltip (M10).
 */
export function EconomicModelCard({
  model,
  year,
  row,
  allTimeYieldPct,
  allTimePricePlaceholder,
}: {
  model: EconomicModel;
  year: number;
  row: PlanYearTarget | null;
  allTimeYieldPct: string | null;
  allTimePricePlaceholder: string | null;
}) {
  return (
    <div className="grid gap-6 rounded-xl border p-4 ring-1 ring-foreground/5 sm:grid-cols-2">
      {/* the three blue targets */}
      <dl className="grid grid-cols-3 gap-3 sm:col-span-2">
        <Field label="Net Income Target" testId="economic-nit">
          {formatPHP(model.netIncomeTarget)}
        </Field>
        <Field
          label="Opex %"
          testId="economic-opex"
          badge={model.opexIsDefault ? "default 22%" : undefined}
        >
          {formatRateAsPercent(model.opexEff)}
        </Field>
        <Field
          label="Cost of Sales %"
          testId="economic-cos"
          badge={model.cosIsDefault ? "default 10%" : undefined}
        >
          {formatRateAsPercent(model.cosEff)}
        </Field>
      </dl>

      {/* net income % (computed) */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Net income %</p>
        <LockedValue
          size="lg"
          formula="Net income % = 1 − Opex % − Cost of Sales %"
          data-testid="economic-net-income-pct"
        >
          {formatRateAsPercent(model.netIncomePct)}
        </LockedValue>
        <p className="text-xs text-muted-foreground">You keep this share of every GCI peso.</p>
      </div>

      {/* working GCI goal (the hero) + raw target struck small */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">Working GCI goal</p>
          <Badge variant="secondary" data-testid="economic-roundup-badge">
            auto round-up ↑ ₱10,000
          </Badge>
        </div>
        <LockedValue
          size="lg"
          className="text-2xl font-semibold"
          formula="Working GCI goal = Net Income Target ÷ net income %, rounded UP to the nearest ₱10,000"
          data-testid="economic-working-goal"
        >
          {formatPHP(model.workingGciGoal)}
        </LockedValue>
        <p className="text-xs text-muted-foreground">
          Raw:{" "}
          <span className="tabular-nums line-through" data-testid="economic-raw-target">
            {formatPHP(model.gciRawTarget)}
          </span>{" "}
          before round-up
        </p>
      </div>

      <div className="sm:col-span-2">
        <EditTargetGate
          year={year}
          row={row}
          allTimeYieldPct={allTimeYieldPct}
          allTimePricePlaceholder={allTimePricePlaceholder}
          testId="economic-edit-gate"
          title={`Edit plan targets for ${year}`}
          description="Set the Net Income Target and your cost assumptions. The GCI goal, deal count and both funnels restate from these."
          trigger={
            <Button variant="outline" size="sm" data-testid="economic-edit">
              <Pencil className="size-3.5" /> Edit targets
            </Button>
          }
        />
      </div>
    </div>
  );
}

function Field({
  label,
  badge,
  testId,
  children,
}: {
  label: string;
  badge?: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className="font-semibold tabular-nums tracking-tight text-affordance-input-foreground"
        data-testid={`${testId}-value`}
      >
        {children}
      </p>
      {badge && (
        <Badge variant="outline" className="text-[10px]">
          {badge}
        </Badge>
      )}
    </div>
  );
}
