"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PaymentWarning, PaymentWarningKey } from "@/lib/payments/warnings";

/**
 * The payment soft-warning banners (FR-M5-04, §6.4): amber, inline, NEVER
 * blocking. Each names the risk in plain language; the form's submit becomes
 * "Log anyway" when any are showing, and a save made past them is audit-logged
 * server-side (log_payment_warning_override — the "Continue anyway (audit-logged)"
 * contract, AC11). These are advisory — the agent is always free to proceed.
 *
 * REOPEN PROMPT (rule 7). A Closed/Cancelled receivable's banner offers to reopen
 * it so balance tracking resumes. Reopening is an M4 status mutation behind M4's
 * own friction gate (PRD §4 rule 7: "Reopening itself is an M4 mutation") — it is
 * NOT assigned to M5 — and M4.3 (status lifecycle) is not built yet. So the
 * affordance is present and the contract is stated, but the action is disabled
 * with a note pointing at where it lands. The payment still logs on "Log anyway";
 * M4 then shows the over-collection in Variance (edge case 8), exactly as the PRD
 * describes for the "log anyway" path.
 */

const WARNING_TITLES: Record<PaymentWarningKey, string> = {
  future_date: "Future-dated payment",
  pre_booking_date: "Dated before the deal was booked",
  possible_duplicate: "Possible duplicate",
  receivable_closed: "This receivable is Closed",
  receivable_cancelled: "This receivable is Cancelled",
};

export function PaymentWarnings({ warnings }: { warnings: readonly PaymentWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="payment-warnings" role="status">
      {warnings.map((warning) => {
        const isReopenable =
          warning.key === "receivable_closed" || warning.key === "receivable_cancelled";
        return (
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
              {isReopenable && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    title="Reopening a receivable arrives with M4.3 (status lifecycle)."
                    data-testid="payment-reopen-receivable"
                  >
                    Reopen receivable
                  </Button>
                  <span className="text-xs text-amber-800/80 dark:text-amber-200/70">
                    Reopening resumes balance tracking — arrives with the receivable
                    status controls. Logging now records the release; the receivable
                    will show it as an over-collection until then.
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
