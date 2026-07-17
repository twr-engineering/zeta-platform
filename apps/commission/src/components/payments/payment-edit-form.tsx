"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import {
  updatePayment,
  deletePayment,
  type PaymentActionState,
} from "@/lib/payments/actions";
import { previewPayment } from "@/lib/payments/preview";
import { equalsToCentavo, formatPHP, toMoney } from "@/lib/money";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { PaymentSplit, PaymentType } from "@/lib/engine";
import type { RawPayment } from "@/lib/payments/schema";
import type { Payment } from "@/types/entities";

/**
 * The payment edit / recompute form (FR-M5-07/10, §6.2/§6.4).
 *
 * Editable: gross, date, type, note. The deal is fixed (shown read-only). Every
 * keystroke re-runs the REAL engine through previewPayment (the same round-trip the
 * fast-entry form uses — never a UI re-implementation, §3.2), so the panel shows the
 * STORED split beside what a re-snapshot would produce NOW, side by side (§6.2), with
 * changed lines highlighted. Saving is friction-gated (rule 11) and re-snapshots at
 * the deal + settings as they are today (§3.3.2). Delete is friction-gated too and
 * the confirmation states the receivable restatement (rule 10). Both route through
 * M5.1's version-locked RPCs; on success the list is where the outcome shows.
 */

type FormValues = {
  paymentDate: string;
  grossAmount: string;
  paymentType: PaymentType;
  referenceNote: string;
};

export type PaymentEditFormProps = {
  payment: Payment;
  dealLabel: string;
  /** The stored split's anchors drifted from today's deal + settings (FR-M5-12). */
  stale: boolean;
  /** Receivable context for the delete confirmation's restatement copy (rule 10). */
  collectedNet: string | null;
  balance: string | null;
  totalCollectible: string | null;
};

/** The stored snapshot, in the engine's PaymentSplit shape for the side-by-side. */
function storedSplit(p: Payment): PaymentSplit {
  return {
    gross: p.gross_amount,
    net_of_vat: p.net_of_vat,
    vat: p.vat_amount,
    ewt: p.ewt_amount,
    net_cash: p.net_cash,
    retained: p.retained_cash,
  };
}

export function PaymentEditForm({
  payment,
  dealLabel,
  stale,
  collectedNet,
  balance,
}: PaymentEditFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<FormValues>({
    paymentDate: payment.payment_date,
    grossAmount: payment.gross_amount,
    paymentType: payment.payment_type,
    referenceNote: payment.reference_note ?? "",
  });

  const [recomputed, setRecomputed] = useState<PaymentSplit | null>(() => storedSplit(payment));
  const [previewing, setPreviewing] = useState(false);

  const raw: RawPayment = useMemo(
    () => ({
      dealId: payment.deal_id,
      paymentDate: values.paymentDate,
      grossAmount: values.grossAmount,
      paymentType: values.paymentType,
      referenceNote: values.referenceNote,
    }),
    [payment.deal_id, values]
  );
  const rawKey = useMemo(() => JSON.stringify(raw), [raw]);

  // Live recompute preview (FR-M5-03): the same engine round-trip as fast-entry,
  // latest-wins so a slow response can't overwrite a newer one. Excludes this
  // payment from its own duplicate check.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      const result = await previewPayment(raw, payment.id);
      if (id !== requestId.current) return;
      setPreviewing(false);
      setRecomputed(result.ok ? result.split : null);
    }, 200);
    return () => clearTimeout(timer);
  }, [rawKey, raw, payment.id]);

  const stored = storedSplit(payment);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // On a successful mutation the outcome shows on the list (revalidated there).
  // Wrapped so the redirect survives ConfirmGate unmounting on success.
  const onDone = (result: PaymentActionState) => {
    if (!result.error && result.message) router.push(ROUTES.payments);
  };
  const gatedUpdate = async (prev: PaymentActionState, formData: FormData) => {
    const result = await updatePayment(prev, formData);
    onDone(result);
    return result;
  };
  const gatedDelete = async (prev: PaymentActionState, formData: FormData) => {
    const result = await deletePayment(prev, formData);
    onDone(result);
    return result;
  };

  const saveLabel = stale ? "Recompute this payment's split" : "Save changes";

  // The receivable restatement the delete confirmation states (rule 10): removing
  // this payment subtracts its Net of VAT from Collected and raises the balance.
  const restoredBalance =
    balance !== null ? toMoney(balance).plus(toMoney(payment.net_of_vat)).toFixed(2) : null;
  const restoredCollected =
    collectedNet !== null
      ? toMoney(collectedNet).minus(toMoney(payment.net_of_vat)).toFixed(2)
      : null;

  return (
    <div className="space-y-6">
      {stale && (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="stale-basis-banner"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            This split was captured under a VAT basis or tax rate that differs from this deal
            and your settings today. Saving re-snapshots it at the current values — history
            for the other payments is untouched.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editable inputs */}
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Deal</Label>
            <div
              className="rounded-lg border bg-muted/40 px-3 py-2 text-sm"
              data-testid="edit-deal-label"
            >
              {dealLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              The deal a payment is logged against cannot be changed here — delete and re-log
              to move it.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-date">Date released</Label>
            <InputField
              id="edit-date"
              type="date"
              value={values.paymentDate}
              onChange={(e) => set("paymentDate", e.target.value)}
              data-testid="edit-paymentDate"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-gross">Gross commission (₱)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-affordance-input-foreground/60">
                ₱
              </span>
              <InputField
                id="edit-gross"
                inputMode="decimal"
                align="end"
                value={values.grossAmount}
                onChange={(e) => set("grossAmount", e.target.value)}
                placeholder="0.00"
                className="pl-7"
                data-testid="edit-grossAmount"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Payment type">
              {(["commission", "incentive"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={values.paymentType === type}
                  onClick={() => set("paymentType", type)}
                  data-testid={`edit-type-${type}`}
                  className={cn(
                    "min-h-9 rounded-md px-4 text-sm font-medium capitalize transition-colors",
                    values.paymentType === type
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-note">OR / Invoice note</Label>
            <InputField
              id="edit-note"
              value={values.referenceNote}
              onChange={(e) => set("referenceNote", e.target.value)}
              placeholder="Optional — OR or invoice reference"
              maxLength={240}
              data-testid="edit-referenceNote"
            />
          </div>
        </div>

        {/* Side-by-side: stored split vs what a recompute would produce (§6.2) */}
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="rounded-xl border bg-card p-4 shadow-xs" data-testid="split-comparison">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Split comparison
              </span>
              {previewing && (
                <span className="text-xs text-muted-foreground" data-testid="split-updating">
                  updating…
                </span>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-sm">
              <span />
              <span className="text-right text-xs font-medium text-muted-foreground">Stored</span>
              <span className="text-right text-xs font-medium text-muted-foreground">If recomputed</span>
              <CompareRow label="Net of VAT" stored={stored.net_of_vat} next={recomputed?.net_of_vat} />
              <CompareRow label="VAT" stored={stored.vat} next={recomputed?.vat} />
              <CompareRow label="EWT" stored={stored.ewt} next={recomputed?.ewt} />
              <CompareRow label="Net Cash" stored={stored.net_cash} next={recomputed?.net_cash} />
              <CompareRow label="Retained" stored={stored.retained} next={recomputed?.retained} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Saving stores the recomputed split as the payment&apos;s new snapshot and records a
              field-level change in your audit log.
            </p>
          </div>
        </aside>
      </div>

      {/* Friction-gated actions (rule 11) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <ConfirmGate
          trigger={
            <Button disabled={values.grossAmount.trim() === ""}>{saveLabel}</Button>
          }
          title={stale ? "Recompute this payment's split?" : "Save this change?"}
          description="This re-runs the tax engine against the deal and your settings as they are now, and stores the result as this payment's new split."
          consequence="The receivable's Collected and Balance restate to match. A field-level old→new entry is written to your audit log."
          gate={{ mode: "checked" }}
          confirmLabel={stale ? "Recompute" : "Save change"}
          action={gatedUpdate}
          testId="payment-edit"
        >
          <input type="hidden" name="id" value={payment.id} />
          <input type="hidden" name="expectedVersion" value={String(payment.version)} />
          <input type="hidden" name="dealId" value={payment.deal_id} />
          <input type="hidden" name="paymentDate" value={values.paymentDate} />
          <input type="hidden" name="grossAmount" value={values.grossAmount} />
          <input type="hidden" name="paymentType" value={values.paymentType} />
          <input type="hidden" name="referenceNote" value={values.referenceNote} />
        </ConfirmGate>

        <ConfirmGate
          trigger={
            <Button variant="outline" className="text-destructive">
              Delete payment
            </Button>
          }
          title="Delete this payment?"
          description={`Removing this ${formatPHP(payment.gross_amount)} release restates its receivable.`}
          consequence={
            restoredBalance !== null && restoredCollected !== null
              ? `Collected drops by ${formatPHP(payment.net_of_vat)} to ${formatPHP(restoredCollected)}, and the balance rises to ${formatPHP(restoredBalance)}.`
              : "The receivable's Collected and Balance will be restated."
          }
          gate={{ mode: "checked" }}
          confirmLabel="Delete payment"
          destructive
          action={gatedDelete}
          testId="payment-delete"
        >
          <input type="hidden" name="id" value={payment.id} />
          <input type="hidden" name="expectedVersion" value={String(payment.version)} />
        </ConfirmGate>
      </div>
    </div>
  );
}

/** One side-by-side line; the "if recomputed" value is highlighted when it differs. */
function CompareRow({
  label,
  stored,
  next,
}: {
  label: string;
  stored: string;
  next: string | undefined;
}) {
  const changed = next !== undefined && !equalsToCentavo(stored, next);
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{formatPHP(stored)}</span>
      <span
        className={cn(
          "text-right tabular-nums",
          next === undefined && "text-muted-foreground",
          changed && "font-semibold text-amber-700 dark:text-amber-300"
        )}
        data-testid={changed ? "split-changed" : undefined}
      >
        {next === undefined ? "—" : formatPHP(next)}
      </span>
    </>
  );
}
