"use client";

import * as React from "react";

import { LockedValue } from "@/components/affordance/locked-value";
import { HelpPopover } from "@/components/help/help-popover";
import { Badge } from "@/components/ui/badge";
import { formatPHP, formatYield } from "@/lib/money";
import type { DealDerived } from "@/lib/engine";

/**
 * The computed panel (M1 PRD §6): the engine's output for the deal being
 * entered, shown live and visibly locked. Every value is a `<LockedValue>` with
 * its formula on hover — the agent learns why a number is what it is instead of
 * trusting a cell (M10). NET GCI is the headline (what the agent actually earns,
 * Rule H).
 *
 * The values come straight from the engine via the preview round-trip, so they
 * are the same figures the save will book, to the centavo (AC 1). The panel
 * NEVER computes money itself (FR-M1-05).
 */

const PROPERTY_VAT_TEXT: Record<DealDerived["property_vat"], string> = {
  vat_able: "VAT-able",
  exempt: "Exempt",
  "n/a": "N/A",
};
const COMM_BASE_TEXT: Record<DealDerived["comm_base"], string> = {
  gross: "Gross",
  net: "Net",
  "n/a": "N/A",
};
const VAT_BASIS_TEXT: Record<DealDerived["vat_basis"], string> = {
  inclusive: "Inclusive",
  "n/a": "N/A",
};

const DASH = "—";

export function ComputedPanel({
  derived,
  pending = false,
  hint,
}: {
  derived: DealDerived | null;
  pending?: boolean;
  hint?: string;
}) {
  const money = (value: string | undefined) =>
    derived && value !== undefined ? formatPHP(value) : DASH;

  return (
    <div
      data-testid="computed-panel"
      data-state={pending ? "updating" : derived ? "ready" : "empty"}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Computed
        </span>
        {derived && (
          <>
            <span className="inline-flex items-center gap-0.5">
              <Badge variant="secondary" data-testid="badge-property-vat">
                Property VAT: {PROPERTY_VAT_TEXT[derived.property_vat]}
              </Badge>
              <HelpPopover
                placement="deal-form.property-vat"
                label="About Property VAT & Force VAT"
                testId="help-deal-property-vat"
              />
            </span>
            <Badge variant="secondary" data-testid="badge-vat-basis">
              VAT Basis: {VAT_BASIS_TEXT[derived.vat_basis]}
            </Badge>
          </>
        )}
        {pending && (
          <span className="text-xs text-muted-foreground" data-testid="panel-updating">
            updating…
          </span>
        )}
      </div>

      {/* NET GCI — the headline figure (Rule H). */}
      <div className="rounded-xl border bg-affordance-locked/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">NET GCI</p>
            <p className="text-xs text-muted-foreground">What you actually earn</p>
          </div>
          <LockedValue
            size="lg"
            align="end"
            formula="NET GCI = GCI + Incentive (net) − Referral Out"
            data-testid="computed-net-gci"
            className="text-lg"
          >
            {money(derived?.net_gci)}
          </LockedValue>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Row
          label="Net List Price"
          formula="Net List = List Price ÷ (1 + VAT rate) when VAT-able; otherwise = List Price"
          testId="computed-net-list"
        >
          {money(derived?.net_list_price)}
        </Row>
        <Row
          label="Commission base"
          formula="Developer deals use the developer's base (Gross = List, Net = Net List). Others show N/A."
          testId="computed-comm-base"
        >
          {derived ? COMM_BASE_TEXT[derived.comm_base] : DASH}
        </Row>
        <Row
          label="Billed commission"
          formula="Billed = Rate × base price (or the fixed amount)"
          testId="computed-billed"
        >
          {money(derived?.billed_commission)}
        </Row>
        <Row
          label="GCI (net of VAT)"
          formula="GCI = billed ÷ (1 + VAT rate) on a taxable deal (VAT is inside the billed figure); = billed when untaxed"
          testId="computed-gci"
        >
          {money(derived?.gci_net_of_vat)}
        </Row>
        <Row
          label="Incentive (net)"
          formula="Incentive net = billed ÷ (1 + VAT rate) when taxable; carried as-is otherwise"
          testId="computed-incentive-net"
        >
          {money(derived?.incentive_net)}
        </Row>
        <Row
          label="Referral out"
          formula="Referral Out = % × billed commission + fixed amount"
          testId="computed-referral-out"
        >
          {money(derived?.referral_out)}
        </Row>
        <Row
          label="VAT (memo)"
          formula="VAT memo = (GCI + taxable incentive) × VAT rate. 0 on an untaxed deal."
          testId="computed-vat-memo"
        >
          {money(derived?.vat_memo)}
        </Row>
        <Row
          label="EWT (memo)"
          formula="EWT memo = (GCI + taxable incentive) × EWT rate. 0 on an untaxed deal."
          testId="computed-ewt-memo"
        >
          {money(derived?.ewt_memo)}
        </Row>
        <Row
          label="Yield on list"
          formula="Yield = NET GCI ÷ List Price"
          testId="computed-yield"
        >
          {derived ? formatYield(derived.yield_on_list) : DASH}
        </Row>
      </dl>

      {!derived && (
        <p className="text-sm text-muted-foreground" data-testid="panel-hint">
          {hint ?? "Fill in the deal above and the numbers appear here, live."}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  formula,
  testId,
  children,
}: {
  label: string;
  formula: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed pb-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <LockedValue formula={formula} align="end" data-testid={testId}>
          {children}
        </LockedValue>
      </dd>
    </div>
  );
}
