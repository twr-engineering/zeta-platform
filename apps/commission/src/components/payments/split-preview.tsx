"use client";

import * as React from "react";

import { LockedValue } from "@/components/affordance/locked-value";
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/money";
import type { PaymentSplit } from "@/lib/engine";

/**
 * The live split preview (FR-M5-03, §6.1) — the engine's five-way split for the
 * gross being entered, shown live and visibly LOCKED. Every value is a
 * <LockedValue> with its formula on hover (M10), the same input-vs-computed
 * convention the deal's ComputedPanel uses: the agent types the gross, the split
 * is computed.
 *
 * The numbers come straight from M1's engine via the preview round-trip
 * (previewPayment), so they are, to the centavo, what create_payment will store
 * — which is the whole point: the agent eyeballs Net of VAT and EWT against the
 * payor's advice before saving (matching numbers = right deal, right basis). This
 * panel NEVER computes money itself (§3.2).
 *
 * Zero-tax rows (Rules P2/P3) show "untaxed" in the VAT/EWT cells rather than a
 * bare ₱0.00 with no context (§6.4).
 */

const DASH = "—";

export function SplitPreview({
  split,
  untaxed = false,
  pending = false,
  hint,
}: {
  split: PaymentSplit | null;
  untaxed?: boolean;
  pending?: boolean;
  hint?: string;
}) {
  const money = (value: string | undefined) =>
    split && value !== undefined ? formatPHP(value) : DASH;

  return (
    <div
      data-testid="split-preview"
      data-state={pending ? "updating" : split ? "ready" : "empty"}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Split preview
        </span>
        {split && untaxed && (
          <Badge variant="secondary" data-testid="split-untaxed-badge">
            Untaxed
          </Badge>
        )}
        {pending && (
          <span className="text-xs text-muted-foreground" data-testid="split-updating">
            updating…
          </span>
        )}
      </div>

      {/* Net Cash — the headline: what actually reaches the bank (N = Gross − EWT). */}
      <div className="rounded-xl border bg-affordance-locked/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Net Cash</p>
            <p className="text-xs text-muted-foreground">What reaches your bank</p>
          </div>
          <LockedValue
            size="lg"
            align="end"
            formula="Net Cash = Gross − EWT (the payor withholds only EWT before wiring)"
            data-testid="split-net-cash"
            className="text-lg"
          >
            {money(split?.net_cash)}
          </LockedValue>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3">
        <Row
          label="Net of VAT"
          formula="Net of VAT = Gross ÷ (1 + VAT rate) on a VAT-inclusive deal; = Gross when untaxed"
          testId="split-net-of-vat"
        >
          {money(split?.net_of_vat)}
        </Row>
        <Row
          label="Output VAT"
          formula="VAT = Gross − Net of VAT (the 12% inside the billed gross; remitted to BIR). Zero on an untaxed deal."
          testId="split-vat"
          untaxed={untaxed}
        >
          {money(split?.vat)}
        </Row>
        <Row
          label="EWT withheld"
          formula="EWT = Net of VAT × EWT rate (the payor withholds it and remits it; you claim it back via BIR 2307). Zero on an untaxed deal."
          testId="split-ewt"
          untaxed={untaxed}
        >
          {money(split?.ewt)}
        </Row>
        <Row
          label="Retained Cash"
          formula="Retained = Gross − VAT − EWT (yours after setting aside the VAT you owe)"
          testId="split-retained"
        >
          {money(split?.retained)}
        </Row>
      </dl>

      {!split && (
        <p className="text-sm text-muted-foreground" data-testid="split-hint">
          {hint ?? "Pick a deal and enter the gross — the split appears here, live."}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  formula,
  testId,
  untaxed = false,
  children,
}: {
  label: string;
  formula: string;
  testId: string;
  untaxed?: boolean;
  children: React.ReactNode;
}) {
  // A zero-tax cell reads "untaxed" rather than a bare ₱0.00 (§6.4) — the reason
  // the number is zero, not just that it is.
  const isZero = children === "₱ 0.00";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed pb-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">
        {untaxed && isZero && (
          <span className="text-xs text-muted-foreground">untaxed</span>
        )}
        <LockedValue formula={formula} align="end" data-testid={testId}>
          {children}
        </LockedValue>
      </dd>
    </div>
  );
}
