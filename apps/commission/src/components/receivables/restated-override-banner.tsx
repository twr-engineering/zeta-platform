"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/forms/form-status";
import { reviewOverrideFlag } from "@/lib/receivables/actions";
import { IDLE } from "@/lib/forms/action-state";
import { formatManilaDate } from "@/lib/date/manila";
import { formatPHP } from "@/lib/money";

/**
 * The restated-override review banner (§4 rule 7, §6): the deal was edited after the
 * Confirmed Collectible was set, so the override may no longer be right. It survives
 * the restatement (it is the user's number) but is flagged until the agent reviews —
 * "Reviewed" (a plain audited edit, no money moves) clears it; re-confirming or
 * clearing the override itself also clears it.
 */
export function RestatedOverrideBanner({
  id,
  editedAt,
  confirmedCollectible,
}: {
  id: string;
  editedAt: string;
  confirmedCollectible: string | null;
}) {
  const [state, formAction, pending] = useActionState(reviewOverrideFlag, IDLE);

  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"
      data-testid="restated-override-banner"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2.5">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-900 dark:text-amber-100">
            The deal was edited on {formatManilaDate(editedAt)}
            {confirmedCollectible !== null
              ? `; your confirmed ${formatPHP(confirmedCollectible)} predates it — review that it still stands.`
              : " — review that the confirmed collectible still stands."}
          </p>
        </div>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="outline" size="sm" disabled={pending} data-testid="review-override">
            {pending ? "Working…" : "Mark reviewed"}
          </Button>
        </form>
      </div>
      {state.error && <div className="mt-2"><FormStatus state={state} /></div>}
    </div>
  );
}
