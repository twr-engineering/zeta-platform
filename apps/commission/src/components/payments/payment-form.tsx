"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, Undo2 } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/forms/form-status";
import { DealPicker } from "@/components/payments/deal-picker";
import { SplitPreview } from "@/components/payments/split-preview";
import { PaymentWarnings } from "@/components/payments/payment-warnings";
import {
  createPayment,
  deletePayment,
  type PaymentActionState,
  type SavedPayment,
} from "@/lib/payments/actions";
import { previewPayment } from "@/lib/payments/preview";
import { CHECKED_VALUE, CONFIRMATION_FIELD } from "@/lib/friction/gate";
import { IDLE } from "@/lib/forms/action-state";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentSplit, PaymentType } from "@/lib/engine";
import type { PaymentWarning } from "@/lib/payments/warnings";
import type { RawPayment } from "@/lib/payments/schema";
import type { PaymentDealOption } from "@/lib/payments/picker";

/**
 * The fast-entry form (§6.1) — the daily heartbeat: "log a release in under 30
 * seconds, one-handed." Field order is optimised ruthlessly: focus opens in the
 * deal picker, date is pre-defaulted to today (Manila), gross is next with a ₱
 * numeric keypad, then the Commission/Incentive toggle (Commission preselected —
 * one extra tap only for the rarer case), then the optional OR/Invoice note.
 *
 * The split preview is a debounced server round-trip through the REAL engine
 * (previewPayment), latest-wins — so what the agent eyeballs matches what saves,
 * to the centavo. Warnings ride along and render as amber banners; the submit
 * becomes "Log anyway" when any show. On save, a toast reports the stored split
 * with an UNDO (the friction-gated soft-delete), and the form resets with focus
 * back in the picker for the next entry.
 */

type FormValues = {
  dealId: string;
  paymentDate: string;
  grossAmount: string;
  paymentType: PaymentType;
  referenceNote: string;
};

export type PaymentFormProps = {
  deals: readonly PaymentDealOption[];
  /** Today as an Asia/Manila civil date (rule 20) — the pre-filled default. */
  today: string;
  /** Cross-link prefill (deal detail → "Log a payment"): the deal to preselect. */
  initialDealId?: string;
};

function emptyValues(today: string, dealId: string): FormValues {
  return {
    dealId,
    paymentDate: today,
    grossAmount: "",
    paymentType: "commission",
    referenceNote: "",
  };
}

export function PaymentForm({ deals, today, initialDealId = "" }: PaymentFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createPayment, IDLE as PaymentActionState);
  const [values, setValues] = useState<FormValues>(() => emptyValues(today, initialDealId));

  const [split, setSplit] = useState<PaymentSplit | null>(null);
  const [untaxed, setUntaxed] = useState(false);
  const [warnings, setWarnings] = useState<PaymentWarning[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [hint, setHint] = useState<string | undefined>();

  const [toast, setToast] = useState<SavedPayment | null>(null);

  // Remounting the picker returns focus to it for the next entry (§6.1).
  const pickerFocusKey = useRef(0);
  const [pickerKey, setPickerKey] = useState(0);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const raw: RawPayment = useMemo(
    () => ({
      dealId: values.dealId,
      paymentDate: values.paymentDate,
      grossAmount: values.grossAmount,
      paymentType: values.paymentType,
      referenceNote: values.referenceNote,
    }),
    [values]
  );
  const rawKey = useMemo(() => JSON.stringify(raw), [raw]);

  // Live split preview (FR-M5-03): a debounced round-trip through the real engine,
  // latest-wins so a slow response can't overwrite a newer one.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      const result = await previewPayment(raw);
      if (id !== requestId.current) return; // superseded
      setPreviewing(false);
      if (result.ok) {
        setSplit(result.split);
        setUntaxed(result.untaxed);
        setWarnings(result.warnings);
        setHint(undefined);
      } else {
        setSplit(null);
        setUntaxed(false);
        setWarnings([]);
        setHint(
          !values.dealId
            ? "Pick a deal to preview its split."
            : result.reason === "incomplete"
              ? "Enter the gross and the split appears here, live."
              : result.error
        );
      }
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey]);

  // A successful save: surface the toast, reset for the next entry, refresh so the
  // picker's balance hints reflect the new collected total. Handled once per save
  // via the payment id (useActionState hands back the same state object).
  const lastHandled = useRef<string | null>(null);
  useEffect(() => {
    const saved = state.saved;
    if (!saved || state.error) return;
    if (lastHandled.current === saved.id) return;
    lastHandled.current = saved.id;
    setToast(saved);
    setValues(emptyValues(today, ""));
    setSplit(null);
    setUntaxed(false);
    setWarnings([]);
    pickerFocusKey.current += 1;
    setPickerKey(pickerFocusKey.current);
    router.refresh();
  }, [state, today, router]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const hasWarnings = warnings.length > 0;
  const canSubmit = values.dealId !== "" && values.grossAmount.trim() !== "";
  const submitLabel = hasWarnings ? "Log anyway" : "Log release";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        action={formAction}
        className="space-y-5"
        data-testid="payment-form"
        data-hydrated={hydrated ? "true" : "false"}
      >
        {/* The visible controls carry names directly — the picker owns its own
            hidden dealId input. */}
        <div className="space-y-1.5">
          <Label htmlFor="payment-deal-search">Deal</Label>
          <DealPicker
            key={pickerKey}
            options={deals}
            value={values.dealId}
            onSelect={(id) => set("dealId", id)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Type a code or client name — “sal”, “21” and “daria” all find D021.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Date released</Label>
            <InputField
              id="payment-date"
              name="paymentDate"
              type="date"
              value={values.paymentDate}
              onChange={(e) => set("paymentDate", e.target.value)}
              data-testid="field-paymentDate"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-gross">Gross commission (₱)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-affordance-input-foreground/60">
                ₱
              </span>
              <InputField
                id="payment-gross"
                name="grossAmount"
                inputMode="decimal"
                align="end"
                value={values.grossAmount}
                onChange={(e) => set("grossAmount", e.target.value)}
                placeholder="0.00"
                className="pl-7"
                data-testid="field-grossAmount"
              />
            </div>
            <p className="text-xs text-muted-foreground">The gross on the payor’s advice, before tax.</p>
          </div>
        </div>

        {/* Type toggle — Commission preselected; a hidden input submits the value. */}
        <div className="space-y-1.5">
          <Label>Type</Label>
          <input type="hidden" name="paymentType" value={values.paymentType} />
          <div
            className="inline-flex rounded-lg border p-0.5"
            role="radiogroup"
            aria-label="Payment type"
          >
            {(["commission", "incentive"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={values.paymentType === type}
                onClick={() => set("paymentType", type)}
                data-testid={`payment-type-${type}`}
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
          <Label htmlFor="payment-note">OR / Invoice note</Label>
          <InputField
            id="payment-note"
            name="referenceNote"
            value={values.referenceNote}
            onChange={(e) => set("referenceNote", e.target.value)}
            placeholder="Optional — OR or invoice reference"
            maxLength={240}
            data-testid="field-referenceNote"
          />
        </div>

        <PaymentWarnings warnings={warnings} />
        <FormStatus state={state} />

        {/* Thumb-reach save: sticky to the bottom of the viewport on phones, inline
            on desktop. Always one tap from anywhere in the form. */}
        <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur supports-backdrop-filter:bg-background/70">
          <Button
            type="submit"
            disabled={pending || !canSubmit}
            className="min-h-11 flex-1 sm:flex-none"
            data-testid="payment-submit"
          >
            {pending ? "Saving…" : submitLabel}
          </Button>
          {hasWarnings && (
            <span className="text-xs text-muted-foreground">Warnings are advisory — you can still log.</span>
          )}
        </div>
      </form>

      {/* Split preview — sticky beside the form on desktop, stacked on mobile. */}
      <aside className="lg:sticky lg:top-20 lg:h-fit">
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <SplitPreview split={split} untaxed={untaxed} pending={previewing} hint={hint} />
        </div>
      </aside>

      {toast && <SaveToast saved={toast} onDismiss={() => setToast(null)} onChanged={() => router.refresh()} />}
    </div>
  );
}

/**
 * The save confirmation toast (§6.1): the stored five-way split + an UNDO. Undo is
 * the friction-gated soft-delete made friction-FREE within the toast window — one
 * tap, the deliberate act being the tap itself, so the confirmation token rides in
 * a hidden field rather than a second dialog (rule 11 satisfied by the explicit
 * click). It restates the receivable back on the way out.
 */
function SaveToast({
  saved,
  onDismiss,
  onChanged,
}: {
  saved: SavedPayment;
  onDismiss: () => void;
  onChanged: () => void;
}) {
  const [undoState, undoAction, undoing] = useActionState(deletePayment, IDLE as PaymentActionState);
  const [undone, setUndone] = useState(false);

  // Auto-dismiss after the toast window unless it's mid-undo. Long enough to read
  // the split and reach for undo one-handed.
  useEffect(() => {
    if (undoing || undone) return;
    const t = setTimeout(onDismiss, 9000);
    return () => clearTimeout(t);
  }, [undoing, undone, onDismiss]);

  // A completed undo restates the receivable — refresh, show the confirmation,
  // then close.
  useEffect(() => {
    if (!undoState.message || undoState.error) return;
    setUndone(true);
    onChanged();
    const t = setTimeout(onDismiss, 2500);
    return () => clearTimeout(t);
  }, [undoState, onChanged, onDismiss]);

  return (
    <div
      data-testid="payment-save-toast"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border bg-popover p-4 text-sm shadow-lg sm:inset-x-auto sm:right-4"
    >
      {undone ? (
        <div className="flex items-center gap-2" data-testid="payment-undone">
          <Undo2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>Payment removed — the receivable has been restated.</p>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                Logged {formatPHP(saved.gross)} against {saved.dealLabel}
              </p>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <SplitLine label="Net of VAT" value={saved.split.net_of_vat} />
                <SplitLine label="VAT" value={saved.split.vat} />
                <SplitLine label="EWT" value={saved.split.ewt} />
                <SplitLine label="Net Cash" value={saved.split.net_cash} />
                <SplitLine label="Retained" value={saved.split.retained} />
              </dl>
            </div>
          </div>

          {undoState.error && (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {undoState.error}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss} data-testid="payment-toast-dismiss">
              Dismiss
            </Button>
            {/* One-tap undo: the confirmation token + optimistic-lock version ride
                in hidden fields (the tap is the deliberate act). */}
            <form action={undoAction}>
              <input type="hidden" name="id" value={saved.id} />
              <input type="hidden" name="expectedVersion" value={String(saved.version)} />
              <input type="hidden" name={CONFIRMATION_FIELD} value={CHECKED_VALUE} />
              <Button type="submit" variant="outline" size="sm" disabled={undoing} data-testid="payment-undo">
                <Undo2 className="size-4" /> {undoing ? "Undoing…" : "Undo"}
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function SplitLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{label}</dt>
      <dd className="tabular-nums text-foreground">{formatPHP(value)}</dd>
    </div>
  );
}
