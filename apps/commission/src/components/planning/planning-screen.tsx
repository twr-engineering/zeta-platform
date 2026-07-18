"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Save, Target, TrendingUp, RotateCcw } from "lucide-react";

import { DashboardSection } from "@/components/dashboard/section";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { updateFunnelRates } from "@/lib/planning/actions";
import {
  computePlan,
  planYearTargetToInput,
  ratePercentInputValue,
  type FunnelRates,
  type Plan,
  type PlanIssue,
  type PlanYearTargetInput,
} from "@/lib/planning";
import type { PlanningBasisContract } from "@/lib/yield";
import { formatAmount, parseAmountInput, percentToRate, rateToPercent } from "@/lib/money";
import type { PlanYearTarget } from "@/types/entities";
import { EconomicModelCard } from "./economic-model-card";
import { AssumptionsRow } from "./assumptions-row";
import { GoalsTable } from "./goals-table";
import { FunnelLadder } from "./funnel-ladders";
import { PaceCard } from "./pace-card";
import { EditTargetGate } from "./edit-target-gate";

/**
 * M3.3 — the planning screen orchestrator (FR-M3-03/07, Rule 8). ALL planning math is the
 * pure engine's: this holds the seven conversion rates in state and re-runs `computePlan`
 * on every keystroke (client-side, <10 ms) so a rate edit repaints the whole plan
 * instantly — it NEVER re-implements a formula. Rate edits persist on confirm through the
 * gated M3.2 action (the form owns percent→decimal). The economic model, goals and pace
 * come straight off the same computed plan.
 *
 * A transiently-invalid rate keeps the ladder on its last good counts and flags the field;
 * a year that was never plannable (no NIT / opex+cos ≥ 100% / empty basis) renders the
 * matching guided empty/validation state instead of a blank plan (rules 1, 5, 9).
 */

const RATE_FIELDS: { key: keyof FunnelRates; form: string }[] = [
  { key: "listingToSold", form: "listing_to_sold" },
  { key: "listingAppointmentRate", form: "listing_appointment_rate" },
  { key: "sellerContactToAppt", form: "seller_contact_to_appt" },
  { key: "sellerLeadToContact", form: "seller_lead_to_contact" },
  { key: "buyerViewingToAtp", form: "buyer_viewing_to_atp" },
  { key: "buyerContactToViewing", form: "buyer_contact_to_viewing" },
  { key: "buyerLeadToContact", form: "buyer_lead_to_contact" },
];

type RatesPercent = Record<keyof FunnelRates, string>;

function toRatesPercent(rates: FunnelRates): RatesPercent {
  return {
    listingToSold: ratePercentInputValue(rates.listingToSold),
    listingAppointmentRate: ratePercentInputValue(rates.listingAppointmentRate),
    sellerContactToAppt: ratePercentInputValue(rates.sellerContactToAppt),
    sellerLeadToContact: ratePercentInputValue(rates.sellerLeadToContact),
    buyerViewingToAtp: ratePercentInputValue(rates.buyerViewingToAtp),
    buyerContactToViewing: ratePercentInputValue(rates.buyerContactToViewing),
    buyerLeadToContact: ratePercentInputValue(rates.buyerLeadToContact),
  };
}

/** A whole-percent string → the decimal the engine/action wants. Invalid/blank → "0",
 * which the engine flags as rate_out_of_range WITHOUT throwing (toMoney("") would throw). */
function toRateDecimal(pct: string): string {
  const parsed = parseAmountInput(pct.trim());
  return parsed ? percentToRate(parsed).toString() : "0";
}

export function PlanningScreen({
  year,
  targetRow,
  rates,
  basis,
}: {
  year: number;
  targetRow: PlanYearTarget | null;
  rates: FunnelRates;
  basis: PlanningBasisContract;
}) {
  const serverPercent = useMemo(() => toRatesPercent(rates), [rates]);
  const serverKey = JSON.stringify(serverPercent);
  const [ratesPercent, setRatesPercent] = useState<RatesPercent>(serverPercent);
  // After a successful save the server value re-flows in and this resets local edits
  // (they now match, so the bar hides); during editing the server key is unchanged.
  useEffect(() => {
    setRatesPercent(JSON.parse(serverKey) as RatesPercent);
  }, [serverKey]);

  const dirty = JSON.stringify(ratesPercent) !== serverKey;

  const targetInput: PlanYearTargetInput = useMemo(
    () =>
      targetRow
        ? planYearTargetToInput(targetRow)
        : {
            year,
            netIncomeTarget: null,
            opexPct: null,
            cosPct: null,
            yieldOverride: null,
            avgPriceOverride: null,
          },
    [targetRow, year]
  );

  const ratesDecimal: FunnelRates = useMemo(
    () => ({
      listingToSold: toRateDecimal(ratesPercent.listingToSold),
      listingAppointmentRate: toRateDecimal(ratesPercent.listingAppointmentRate),
      sellerContactToAppt: toRateDecimal(ratesPercent.sellerContactToAppt),
      sellerLeadToContact: toRateDecimal(ratesPercent.sellerLeadToContact),
      buyerViewingToAtp: toRateDecimal(ratesPercent.buyerViewingToAtp),
      buyerContactToViewing: toRateDecimal(ratesPercent.buyerContactToViewing),
      buyerLeadToContact: toRateDecimal(ratesPercent.buyerLeadToContact),
    }),
    [ratesPercent]
  );

  const planResult = useMemo(
    () => computePlan(targetInput, ratesDecimal, basis),
    [targetInput, ratesDecimal, basis]
  );

  // Hold the last good plan so a transiently-invalid rate keeps the ladder visible.
  const lastGood = useRef<Plan | null>(null);
  if (planResult.ok) lastGood.current = planResult.plan;
  const plan = planResult.ok ? planResult.plan : lastGood.current;
  const issues: PlanIssue[] = planResult.ok ? [] : planResult.issues;

  const allTimeYieldPct =
    basis.all_time_yield === null ? null : rateToPercent(basis.all_time_yield).toDecimalPlaces(4).toString();
  const allTimePricePlaceholder =
    basis.all_time_price === null ? null : formatAmount(basis.all_time_price);

  const onRateChange = (field: keyof FunnelRates, value: string) =>
    setRatesPercent((prev) => ({ ...prev, [field]: value }));

  const editGate = (triggerLabel: string, testId: string) => (
    <EditTargetGate
      year={year}
      row={targetRow}
      allTimeYieldPct={allTimeYieldPct}
      allTimePricePlaceholder={allTimePricePlaceholder}
      testId={testId}
      title={`Set plan targets for ${year}`}
      description="Enter a Net Income Target and, if you like, your cost assumptions and per-year overrides."
      trigger={
        <Button data-testid={`${testId}-open`}>
          <Target className="size-4" /> {triggerLabel}
        </Button>
      }
    />
  );

  // --- no good plan → the guided empty / validation states (rules 1, 5, 9) ----
  if (!plan) {
    // Priority: a missing NIT blocks everything (rule 9) → ask for it first; then the
    // opex+cos validation (rule 1); then the empty basis (rule 5).
    if (issues.some((i) => i.code === "net_income_target_missing")) {
      return (
        <div data-testid="plan-empty-nit">
          <EmptyState
            icon={<Target />}
            title={`Set a Net Income Target for ${year} to build the plan`}
            description="Your Net Income Target drives the whole plan — the GCI goal, the deals you need, and both prospecting funnels."
            action={editGate("Set the target", "empty-nit-edit")}
          />
        </div>
      );
    }
    if (issues.some((i) => i.code === "net_income_pct_nonpositive")) {
      return (
        <div data-testid="plan-empty-invalid">
          <EmptyState
            icon={<AlertTriangle />}
            title="Opex % + Cost of Sales % must total less than 100%"
            description={`${year}'s cost assumptions leave no net income to earn a GCI goal from. Lower Opex % or Cost of Sales % so they total under 100%.`}
            action={editGate("Fix the assumptions", "empty-invalid-edit")}
          />
        </div>
      );
    }
    if (issues.some((i) => i.code === "basis_unavailable")) {
      return (
        <div data-testid="plan-empty-basis">
          <EmptyState
            icon={<TrendingUp />}
            title="No closed sales yet — enter a working yield and average price"
            description={`Planning normally uses your all-time realized yield and average sale price, but this workspace has no closed sales. Set a yield and average price override for ${year} to plan with.`}
            action={editGate("Enter yield & price", "empty-basis-edit")}
          />
        </div>
      );
    }
    // Any other typed issue (e.g. an out-of-range default rate) — should not happen on a
    // fresh year, but never render a blank plan.
    return (
      <div data-testid="plan-empty-nit">
        <EmptyState
          icon={<Target />}
          title={`Set a Net Income Target for ${year} to build the plan`}
          description="Your Net Income Target drives the whole plan — the GCI goal, the deals you need, and both prospecting funnels."
          action={editGate("Set the target", "empty-nit-edit")}
        />
      </div>
    );
  }

  // --- the full plan ----------------------------------------------------------
  return (
    <div className="space-y-8">
      <DashboardSection index={1} title="Economic model" testId="section-economic">
        <EconomicModelCard
          model={plan.economicModel}
          year={year}
          row={targetRow}
          allTimeYieldPct={allTimeYieldPct}
          allTimePricePlaceholder={allTimePricePlaceholder}
        />
      </DashboardSection>

      <DashboardSection
        index={2}
        title="Assumptions"
        description="What one average deal earns — the basis that turns your GCI goal into a deal count."
        testId="section-assumptions"
      >
        <AssumptionsRow
          assumptions={plan.assumptions}
          year={year}
          row={targetRow}
          allTimeYieldPct={allTimeYieldPct}
          allTimePricePlaceholder={allTimePricePlaceholder}
        />
      </DashboardSection>

      <DashboardSection index={3} title="Goals" testId="section-goals">
        <GoalsTable goals={plan.goals} />
      </DashboardSection>

      <DashboardSection
        index={4}
        title="Prospecting funnels"
        description="Divide upward from deals to the weekly activity that produces them. Every conversion rate is yours to edit — the counts recompute instantly."
        testId="section-funnels"
        action={
          dirty ? (
            <div className="flex items-center gap-2" data-testid="rates-save-bar">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRatesPercent(JSON.parse(serverKey) as RatesPercent)}
                data-testid="rates-reset"
              >
                <RotateCcw className="size-3.5" /> Reset
              </Button>
              <ConfirmGate
                testId="rates-save-gate"
                trigger={
                  <Button size="sm" data-testid="rates-save">
                    <Save className="size-3.5" /> Save rates
                  </Button>
                }
                title="Save your conversion rates"
                description="These rates set the whole prospecting plan and are audit-logged."
                consequence="Every funnel count restates from the new rates."
                gate={{ mode: "checked" }}
                confirmLabel="Save rates"
                action={updateFunnelRates}
              >
                {RATE_FIELDS.map(({ key, form }) => (
                  <input key={form} type="hidden" name={form} value={toRateDecimal(ratesPercent[key])} />
                ))}
              </ConfirmGate>
            </div>
          ) : undefined
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelLadder
            funnel={plan.sellerFunnel}
            title="Seller side — listings"
            ratesPercent={ratesPercent}
            onRateChange={onRateChange}
            issues={issues}
          />
          <FunnelLadder
            funnel={plan.buyerFunnel}
            title="Buyer side — ATP"
            ratesPercent={ratesPercent}
            onRateChange={onRateChange}
            issues={issues}
          />
        </div>
      </DashboardSection>

      <DashboardSection
        index={5}
        title="Total sales & pace"
        description="The sales volume this goal requires, and how your booked deals track against it."
        testId="section-pace"
      >
        <PaceCard pace={plan.pace} />
      </DashboardSection>
    </div>
  );
}
