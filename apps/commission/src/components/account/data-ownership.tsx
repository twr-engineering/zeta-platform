"use client";

import { Download, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { deleteAccount } from "@/lib/account/actions";
import { DELETE_ACCOUNT_PHRASE } from "@/lib/account/account";
import { WORKSPACE_EXPORT_PATH } from "@/lib/routes";

/**
 * Data ownership (M0.4, FR-M0-10): the "it's my data" export and account
 * deletion, side by side and in that order deliberately — the export is offered
 * before, and again inside, the delete.
 *
 * Deletion is TYPED confirmation (gate.ts `typed`): it is the one irreversible
 * act in the product, so it earns the strongest gate. The server refuses a
 * delete whose phrase does not match even if this dialog is bypassed
 * (checkConfirmation runs first in the action), and it only ever deletes the
 * caller's own account.
 */
export function DataOwnership() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <ExportEverythingButton />
        <p className="text-xs text-pretty text-muted-foreground">
          Every table in your workspace — deals settings, both trails, all your
          lists — as CSV and Excel in one zip. Yours to keep or hand to your
          accountant, any time.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-destructive/30 p-4">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />
          <h3 className="text-sm font-medium">Delete account</h3>
        </div>
        <p className="text-xs text-pretty text-muted-foreground">
          Permanently deletes your account and your entire workspace — every
          deal, payment, receivable and setting, and this whole history. It
          cannot be undone. Export your data first.
        </p>

        <ConfirmGate
          testId="delete-account-gate"
          destructive
          trigger={
            <Button variant="destructive" size="sm" data-testid="delete-account-button">
              Delete account
            </Button>
          }
          title="Delete your account and workspace?"
          description={
            <>
              This erases everything in your workspace and cannot be undone.{" "}
              <a
                href={WORKSPACE_EXPORT_PATH}
                className="font-medium underline underline-offset-4"
                data-testid="delete-export-offer"
              >
                Export everything first
              </a>{" "}
              if you have not already.
            </>
          }
          consequence="Your account, your workspace, and every deal, payment, receivable, list and audit entry in it will be permanently deleted."
          gate={{ mode: "typed", phrase: DELETE_ACCOUNT_PHRASE }}
          confirmLabel="Delete forever"
          action={deleteAccount}
        />
      </div>
    </div>
  );
}

/**
 * A plain link, not a fetch: the browser downloads a URL, and the server's
 * Content-Disposition names the file (matches the per-list export buttons).
 */
function ExportEverythingButton() {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<a href={WORKSPACE_EXPORT_PATH} />}
      data-testid="export-workspace"
    >
      <Download />
      Export everything
    </Button>
  );
}
