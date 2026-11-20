"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, RotateCcw } from "lucide-react";

import { LockedValue } from "@/components/affordance/locked-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { upsertPlanYearTarget } from "@/lib/planning/actions";
import { formatPHP, formatYield } from "@/lib/money";
import { assumptionSourceLabel, type Assumptions } from "@/lib/planning";
import { ROUTES } from "@/lib/routes";
import type { PlanYearTarget } from "@/types/entities";
import { EditTargetGate } from "./edit-target-gate";

/**
 * M3.3 §6 assumptions row (FR-M3-05): the average sale price and blended yield that
 * feed fees-per-deal, each showing its SOURCE — "All-time realized" (the live M2 basis,
 * linked to the Yield Summary) or "Override for {year}" (the per-year manual cell, a
 * blue departure). An override wears a chip with one-click revert-to-all-time; editing
 * opens the same gated target modal. Fees per deal is locked with its formula (Rule P6 —
 * NO ÷1.12).
 */
export function AssumptionsRow({
  assumptions: a,
  year,
  row,
  allTimeYieldPct,
  allTimePricePlaceholder,
}: {
  assumptions: Assumptions;
  year: number;
  row: PlanYearTarget | null;
  allTimeYieldPct: string | null;
  allTimePricePlaceholder: string | null;
}) {
  return (
    <div className="grid gap-4 rounded-xl border p-4 ring-1 ring-foreground/5 sm:grid-cols-3">
      <AssumptionCell
        label="Average sale price"
        testId="assumption-price"
        source={a.priceSource}
        year={year}
        row={row}
        clearField="avg_price_override"
      >
        {formatPHP(a.priceEff)}
      </AssumptionCell>

      <AssumptionCell
        label="Blended yield"
        testId="assumption-yield"
        source={a.yieldSource}
        year={year}
        row={row}
        clearField="yield_override"
      >
        {formatYield(a.yieldEff)}
      </AssumptionCell>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Professional fees / deal</p>
        <LockedValue
          size="lg"
          formula="Fees per deal = average price × yield (Net of VAT — no ÷1.12)"
          data-testid="assumption-fees"
        >
          {formatPHP(a.feesPerDeal)}
        </LockedValue>
        <div>
          <EditTargetGate
            year={year}
            row={row}
            allTimeYieldPct={allTimeYieldPct}
            allTimePricePlaceholder={allTimePricePlaceholder}
            testId="assumption-edit-gate"
            title={`Override price & yield for ${year}`}
            description="A per-year override replaces your all-time realized basis for this plan only. Leave a field blank to keep using the all-time value."
            trigger={
              <Button variant="outline" size="sm" data-testid="assumption-edit">
                <Pencil className="size-3.5" /> Edit assumptions
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}

function AssumptionCell({
  label,
  testId,
  source,
  year,
  row,
  clearField,
  children,
}: {
  label: string;
  testId: string;
  source: "override" | "all_time";
  year: number;
  row: PlanYearTarget | null;
  clearField: "yield_override" | "avg_price_override";
  children: React.ReactNode;
}) {
  const isOverride = source === "override";
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <LockedValue
        variant={isOverride ? "locked" : "linked"}
        size="lg"
        data-testid={`${testId}-value`}
      >
        {children}
      </LockedValue>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isOverride ? "secondary" : "outline"} data-testid={`${testId}-source`}>
          {assumptionSourceLabel(source, year)}
        </Badge>
        {isOverride ? (
          <RevertOverrideGate testId={testId} year={year} row={row} clearField={clearField} />
        ) : (
          <Link
            href={ROUTES.yieldSummary}
            className="text-xs text-primary hover:underline"
            data-testid={`${testId}-basis-link`}
          >
            View basis
          </Link>
        )}
      </div>
    </div>
  );
}

/** One-click revert of a single override back to the all-time basis (rule 3, §6). Submits
 * the WHOLE row (stored decimals pass straight through) with the one override blanked. */
function RevertOverrideGate({
  testId,
  year,
  row,
  clearField,
}: {
  testId: string;
  year: number;
  row: PlanYearTarget | null;
  clearField: "yield_override" | "avg_price_override";
}) {
  return (
    <ConfirmGate
      testId={`${testId}-revert-gate`}
      trigger={
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" data-testid={`${testId}-revert`}>
          <RotateCcw className="size-3" /> Revert to all-time
        </Button>
      }
      title="Revert to your all-time realized figure"
      description={`This clears the ${year} override and uses your live all-time basis again.`}
      consequence="The plan restates. The change is audit-logged."
      gate={{ mode: "checked" }}
      confirmLabel="Revert"
      action={upsertPlanYearTarget}
    >
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="net_income_target" value={row?.net_income_target ?? ""} />
      <input type="hidden" name="opex_pct" value={row?.opex_pct ?? ""} />
      <input type="hidden" name="cos_pct" value={row?.cos_pct ?? ""} />
      <input
        type="hidden"
        name="yield_override"
        value={clearField === "yield_override" ? "" : row?.yield_override ?? ""}
      />
      <input
        type="hidden"
        name="avg_price_override"
        value={clearField === "avg_price_override" ? "" : row?.avg_price_override ?? ""}
      />
    </ConfirmGate>
  );
}
