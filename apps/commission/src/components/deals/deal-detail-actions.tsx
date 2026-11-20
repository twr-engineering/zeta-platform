"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/forms/form-status";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { archiveDeal, deleteDeal, restoreDeal } from "@/lib/deals/actions";
import { IDLE, type ActionState } from "@/lib/forms/action-state";
import { dealEditPath, ROUTES } from "@/lib/routes";

/**
 * The deal's actions (FR-M1-04, §4 rule 2): edit, archive/restore, delete.
 *
 * Archive is the always-available soft delete; restore brings it back. Delete is
 * gated `checked` and, once M5 lands, refused server-side for a deal with
 * payments (the RLS delete policy, not this button) — the action returns that
 * refusal as a sentence offering Archive. A successful delete retires the code
 * and returns to the list.
 */
export function DealDetailActions({
  id,
  code,
  archived,
}: {
  id: string;
  code: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [archiveState, archiveAction, archivePending] = useActionState(
    archived ? restoreDeal : archiveDeal,
    IDLE
  );
  const [deleteOutcome, setDeleteOutcome] = useState<ActionState | null>(null);

  // Archive/restore stay on the page — just refresh so the status flips.
  useEffect(() => {
    if (archiveState.message && !archiveState.error) router.refresh();
  }, [archiveState.message, archiveState.error, router]);

  // A successful delete leaves nothing to show — go back to the list.
  useEffect(() => {
    if (deleteOutcome?.message && !deleteOutcome.error) router.push(ROUTES.deals);
  }, [deleteOutcome, router]);

  const gatedDelete = async (prev: ActionState, formData: FormData) => {
    const result = await deleteDeal(prev, formData);
    setDeleteOutcome(result);
    return result;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={dealEditPath(code)} />}
          data-testid="edit-deal"
        >
          <Pencil className="size-4" /> Edit
        </Button>

        <form action={archiveAction}>
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="outline"
            disabled={archivePending}
            data-testid={archived ? "restore-deal" : "archive-deal"}
          >
            {archivePending ? "Working…" : archived ? "Restore" : "Archive"}
          </Button>
        </form>

        <ConfirmGate
          trigger={
            <Button variant="destructive" data-testid="delete-deal">
              Delete
            </Button>
          }
          title={`Delete ${code}?`}
          description="Deleting retires this deal's code — it is never reused. A deal with payments logged against it cannot be deleted; archive it instead."
          gate={{ mode: "checked" }}
          confirmLabel="Delete deal"
          action={gatedDelete}
          destructive
          testId="delete-gate"
        >
          <input type="hidden" name="id" value={id} />
        </ConfirmGate>
      </div>

      <FormStatus state={archiveState} />
      {deleteOutcome?.error && <FormStatus state={deleteOutcome} />}
    </div>
  );
}
