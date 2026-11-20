"use client";

import * as React from "react";
import { useState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { upsertPlanYearTarget } from "@/lib/planning/actions";
import { parseAmountInput, percentToRate, rateToPercent } from "@/lib/money";
import type { PlanYearTarget } from "@/types/entities";

/**
 * M3.3 — the ONE gated surface that writes a PlanYearTarget row (FR-M3-01, rule 14).
 * The economic-model card, the assumptions row and the targets-table editor all open
 * this so the five target fields are never nulled by a partial save: `upsert_plan_year_target`
 * replaces the whole row, so this form always submits ALL five fields (the untouched
 * ones prefilled from the current row).
 *
 * THE FORM OWNS PERCENT↔DECIMAL (m3_2Handoff): the agent types whole percents (Opex
 * 22, yield 4.0736) into blue inputs; the hidden payload divides them to the decimals
 * the M3.2 action layer expects ("0.22", "0.040736"). NIT and average price submit as
 * typed money (the action strips ₱/commas). Blank ⇒ the field's "use default / use
 * all-time / not-plannable" null. The visible controls carry NO `name`; the hidden
 * block is what submits (the tax-settings-form pattern), so either the gate's portal
 * form or a plain form sends identical values.
 */

/** A whole-percent field → the decimal the action stores, or "" (→ null), or the raw
 * text when it does not parse (so the server rejects it with a typed reason). */
function percentFieldToDecimal(pct: string): string {
  const t = pct.trim();
  if (t === "") return "";
  const parsed = parseAmountInput(t);
  return parsed ? percentToRate(parsed).toString() : t;
}

/** A stored decimal rate → the whole-percent number a blue input is seeded with. */
function decimalToPercentInput(dec: string | null): string {
  return dec === null ? "" : rateToPercent(dec).toString();
}

export type EditTargetGateProps = {
  year: number;
  /** The current row for prefill, or null when creating the year. */
  row: PlanYearTarget | null;
  /** All-time basis, shown as placeholder ("use all-time") on the blank overrides. */
  allTimeYieldPct: string | null;
  allTimePricePlaceholder: string | null;
  trigger: React.ReactElement;
  title: string;
  description: React.ReactNode;
  testId: string;
  /** Add-a-year: render a blue year input instead of the fixed hidden year (§6). */
  yearEditable?: boolean;
};

export function EditTargetGate({
  year,
  row,
  allTimeYieldPct,
  allTimePricePlaceholder,
  trigger,
  title,
  description,
  testId,
  yearEditable = false,
}: EditTargetGateProps) {
  const [yearValue, setYearValue] = useState(String(year));
  const [nit, setNit] = useState(row?.net_income_target ?? "");
  const [opexPct, setOpexPct] = useState(decimalToPercentInput(row?.opex_pct ?? null));
  const [cosPct, setCosPct] = useState(decimalToPercentInput(row?.cos_pct ?? null));
  const [yieldPct, setYieldPct] = useState(decimalToPercentInput(row?.yield_override ?? null));
  const [avgPrice, setAvgPrice] = useState(row?.avg_price_override ?? "");

  return (
    <ConfirmGate
      testId={testId}
      trigger={trigger}
      title={title}
      description={description}
      consequence="Saving restates every figure on this plan and the dashboard pace line. The change is audit-logged."
      gate={{ mode: "checked" }}
      confirmLabel="Save targets"
      action={upsertPlanYearTarget}
    >
      {/* hidden payload — the values that actually submit (decimals for the rates) */}
      <input type="hidden" name="year" value={yearValue.trim()} />
      <input type="hidden" name="net_income_target" value={nit.trim()} />

      {yearEditable && (
        <div className="space-y-1.5">
          <Label htmlFor={`${testId}-year`}>Year</Label>
          <InputField
            id={`${testId}-year`}
            align="end"
            inputMode="numeric"
            value={yearValue}
            onChange={(e) => setYearValue(e.target.value)}
            placeholder="2027"
            data-testid={`${testId}-year`}
          />
        </div>
      )}
      <input type="hidden" name="opex_pct" value={percentFieldToDecimal(opexPct)} />
      <input type="hidden" name="cos_pct" value={percentFieldToDecimal(cosPct)} />
      <input type="hidden" name="yield_override" value={percentFieldToDecimal(yieldPct)} />
      <input type="hidden" name="avg_price_override" value={avgPrice.trim()} />

      <div className="space-y-1.5">
        <Label htmlFor={`${testId}-nit`}>Net Income Target (₱)</Label>
        <InputField
          id={`${testId}-nit`}
          align="end"
          inputMode="decimal"
          value={nit}
          onChange={(e) => setNit(e.target.value)}
          placeholder="Leave blank — year not plannable"
          data-testid={`${testId}-nit`}
        />
        <p className="text-xs text-muted-foreground">The profit you want to keep this year.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${testId}-opex`}>Opex %</Label>
          <InputField
            id={`${testId}-opex`}
            align="end"
            inputMode="decimal"
            value={opexPct}
            onChange={(e) => setOpexPct(e.target.value)}
            placeholder="22 (default)"
            data-testid={`${testId}-opex`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${testId}-cos`}>Cost of Sales %</Label>
          <InputField
            id={`${testId}-cos`}
            align="end"
            inputMode="decimal"
            value={cosPct}
            onChange={(e) => setCosPct(e.target.value)}
            placeholder="10 (default)"
            data-testid={`${testId}-cos`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${testId}-yield`}>Yield % override</Label>
          <InputField
            id={`${testId}-yield`}
            align="end"
            inputMode="decimal"
            value={yieldPct}
            onChange={(e) => setYieldPct(e.target.value)}
            placeholder={allTimeYieldPct ? `${allTimeYieldPct} (all-time)` : "all-time"}
            data-testid={`${testId}-yield`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${testId}-price`}>Avg price ₱ override</Label>
          <InputField
            id={`${testId}-price`}
            align="end"
            inputMode="decimal"
            value={avgPrice}
            onChange={(e) => setAvgPrice(e.target.value)}
            placeholder={allTimePricePlaceholder ? `${allTimePricePlaceholder} (all-time)` : "all-time"}
            data-testid={`${testId}-price`}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave Opex/CoS blank for the 22%/10% defaults; leave yield/price blank to use your
        all-time realized figures.
      </p>
    </ConfirmGate>
  );
}
