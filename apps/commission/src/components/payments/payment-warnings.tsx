"use client";

import { useActionState, useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reopenReceivable } from "@/lib/receivables/actions";
import { CHECKED_VALUE, CONFIRMATION_FIELD } from "@/lib/friction/gate";
import { IDLE, type ActionState } from "@/lib/forms/action-state";
import type { PaymentWarning, PaymentWarningKey } from "@/lib/payments/warnings";

/**
 * The payment soft-warning banners (FR-M5-04, §6.4): amber, inline, NEVER
 * blocking. Each names the risk in plain language; the form's submit becomes
 * "Log anyway" when any are showing, and a save made past them is audit-logged
 * server-side (log_payment_warning_override — the "Continue anyway (audit-logged)"
 * contract, AC11). These are advisory — the agent is always free to proceed.
 *
 * REOPEN (rule 7) — LIVE as of M4.3. A Closed/Cancelled receivable's banner offers
 * to reopen it so balance tracking resumes. Reopening is an M4 status mutation
 * behind M4's friction gate (reopen_receivable, confirmation-token gated + audited);
 * on success `onReopened` re-previews so the warning clears and the payment lands on
 * an Open receivable. "Log anyway" still works — M4 then surfaces the over-collection
 * in Variance (edge case 8), exactly as the PRD describes for that path.
 */

const WARNING_TITLES: Record<PaymentWarningKey, string> = {
  future_date: "Future-dated payment",
  pre_booking_date: "Dated before the deal was booked",
  possible_duplicate: "Possible duplicate",
  receivable_closed: "This receivable is Closed",
  receivable_cancelled: "This receivable is Cancelled",
};

export function PaymentWarnings({
  warnings,
  onReopened,
}: {
  warnings: readonly PaymentWarning[];
  /** Re-run the preview after a successful reopen so the warning clears. */
  onReopened?: () => void;
}) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="payment-warnings" role="status">
      {warnings.map((warning) => (
        <div
          key={warning.key}
          data-testid={`payment-warning-${warning.key}`}
          className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            <div>
              <p className="font-medium">{WARNING_TITLES[warning.key]}</p>
              <p className="text-pretty">{warning.message}</p>
            </div>
            {(warning.key === "receivable_closed" ||
              warning.key === "receivable_cancelled") &&
              warning.receivableId != null &&
              warning.receivableVersion != null && (
                <ReopenReceivable
                  receivableId={warning.receivableId}
                  version={warning.receivableVersion}
                  onReopened={onReopened}
                />
              )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The inline reopen affordance. It CANNOT be a nested <form> — this banner renders
 * inside the payment <form>, and a form-in-a-form is invalid HTML (the browser drops
 * the inner one, so its submit never fires). Instead it dispatches the friction-gated
 * server action directly from the click with a hand-built FormData (the confirmation
 * token is the deliberate act — the same contract as the save toast's one-tap undo).
 * On success it re-previews via onReopened; the parent clears the banner.
 */
function ReopenReceivable({
  receivableId,
  version,
  onReopened,
}: {
  receivableId: string;
  version: number;
  onReopened?: () => void;
}) {
  const [state, dispatch, pending] = useActionState(reopenReceivable, IDLE as ActionState);
  const done = !!state.message && !state.error;

  useEffect(() => {
    if (done) onReopened?.();
  }, [done, onReopened]);

  if (done) {
    return (
      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status">
        Receivable reopened — balance tracking has resumed.
      </p>
    );
  }

  function reopen() {
    const fd = new FormData();
    fd.set("id", receivableId);
    fd.set("expectedVersion", String(version));
    fd.set(CONFIRMATION_FIELD, CHECKED_VALUE);
    dispatch(fd);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={reopen}
        data-testid="payment-reopen-receivable"
      >
        {pending ? "Reopening…" : "Reopen receivable"}
      </Button>
      <span className="text-xs text-amber-800/80 dark:text-amber-200/70">
        Resumes balance tracking. Or log anyway — it will show as an over-collection
        until you reopen.
      </span>
      {state.error && (
        <p className="w-full text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
