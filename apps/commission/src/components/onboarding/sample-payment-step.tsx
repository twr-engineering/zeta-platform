"use client";

/**
 * M10.3 — the optional sample payment leg (FR-M10-07). Logs a Gross ₱50,000
 * Incentive release against the sample deal through M5's REAL create path
 * (createPayment) and shows the live split from M5's REAL engine (previewPayment).
 * M10 computes nothing — every figure here is M5's response. The payment inherits
 * is_sample from the deal in the DB (§3.5), so it carries the SAMPLE badge and is
 * removed by the cleanup cascade; it never ticks the checklist's first_payment
 * (rule 10).
 */
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputField } from "@/components/affordance/input-field";
import { LockedValue } from "@/components/affordance/locked-value";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/forms/form-status";
import { createPayment, type PaymentActionState } from "@/lib/payments/actions";
import { previewPayment } from "@/lib/payments/preview";
import { formatPHP } from "@/lib/money";
import { IDLE } from "@/lib/forms/action-state";
import type { PaymentSplit } from "@/lib/engine";
import type { RawPayment } from "@/lib/payments/schema";
import { D021_SAMPLE_PAYMENT } from "@/lib/onboarding/sample-fixture";

export function SamplePaymentStep({
  dealId,
  dealLabel,
  today,
  onLogged,
  onSkip,
}: {
  dealId: string;
  dealLabel: string;
  today: string;
  onLogged: () => void;
  onSkip: () => void;
}) {
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(
    createPayment,
    IDLE,
  );
  const [gross, setGross] = useState<string>(D021_SAMPLE_PAYMENT.gross);
  const [date, setDate] = useState<string>(today);
  const [split, setSplit] = useState<PaymentSplit | null>(null);

  // parsePayment/rawFromForm read camelCase keys (the payment form's convention).
  const raw: RawPayment = useMemo(
    () => ({
      dealId,
      paymentDate: date,
      grossAmount: gross,
      paymentType: "incentive",
      referenceNote: "Sample incentive release",
    }),
    [dealId, date, gross],
  );
  const rawKey = useMemo(() => JSON.stringify(raw), [raw]);

  // Live split from M5's engine (debounced, latest-wins) — the teaching moment.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await previewPayment(raw);
      if (id !== requestId.current) return;
      setSplit(result.ok ? result.split : null);
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey]);

  // On a successful save, hand back to the walkthrough (it shows the moved balance).
  useEffect(() => {
    if (state.message && !state.error) onLogged();
  }, [state.message, state.error, onLogged]);

  return (
    <div className="space-y-5" data-testid="sample-payment-step">
      <div className="space-y-1">
        <h3 className="font-heading text-base font-medium">
          Optional: log a sample release
        </h3>
        <p className="text-sm text-pretty text-muted-foreground">
          Developers pay commission in releases. Log a ₱50,000 incentive release
          against <span className="font-medium">{dealLabel}</span> and watch VAT and
          EWT split automatically — then see the receivable balance move.
        </p>
      </div>

      <form action={formAction} className="space-y-4" data-testid="sample-payment-form">
        {Object.entries(raw).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value ?? ""} />
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sample-gross">Gross release ₱</Label>
            <InputField
              id="sample-gross"
              inputMode="decimal"
              align="end"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              data-testid="sample-payment-gross"
            />
            <p className="text-xs text-muted-foreground">
              Type = Incentive. D021&rsquo;s sample release is ₱50,000.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sample-date">Release date</Label>
            <InputField
              id="sample-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="sample-payment-date"
            />
          </div>
        </div>

        {/* The split — M5's engine output, shown locked (never computed here). */}
        <div
          className="rounded-xl border bg-affordance-locked/40 p-4"
          data-testid="sample-split"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Net Cash to bank</p>
              <p className="text-xs text-muted-foreground">Gross − EWT</p>
            </div>
            <LockedValue
              size="lg"
              align="end"
              formula="Net Cash = Gross − EWT"
              data-testid="sample-split-net-cash"
              className="text-lg"
            >
              {split ? formatPHP(split.net_cash) : "—"}
            </LockedValue>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <SplitRow label="Net of VAT" value={split?.net_of_vat} testId="sample-split-net-of-vat" />
            <SplitRow label="Output VAT" value={split?.vat} testId="sample-split-vat" />
            <SplitRow label="EWT withheld" value={split?.ewt} testId="sample-split-ewt" />
            <SplitRow label="Retained" value={split?.retained} testId="sample-split-retained" />
          </dl>
        </div>

        <FormStatus state={state} />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending} data-testid="sample-payment-submit">
            {pending ? "Logging…" : "Log the ₱50,000 release"}
          </Button>
          <Button type="button" variant="ghost" onClick={onSkip} data-testid="sample-payment-skip">
            Skip — I&rsquo;ve seen enough
          </Button>
        </div>
      </form>
    </div>
  );
}

function SplitRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | undefined;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <LockedValue align="end" formula={`${label} — from M5's engine`} data-testid={testId}>
          {value ? formatPHP(value) : "—"}
        </LockedValue>
      </dd>
    </div>
  );
}
