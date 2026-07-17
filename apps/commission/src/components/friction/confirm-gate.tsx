"use client";

import * as React from "react";
import { useActionState, useEffect, useId, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CHECKED_VALUE,
  CONFIRMATION_FIELD,
  type FrictionGate,
} from "@/lib/friction/gate";
import { IDLE, type ActionState } from "@/lib/forms/action-state";

/**
 * The friction-gate confirmation (M0 §3.2, rule 9; M0.1 deliverable).
 *
 * v1 gates destructive and money-restating actions on deliberateness rather than
 * on roles — there is only one human in the workspace. This component collects
 * the confirmation; `checkConfirmation` in @/lib/friction/gate is what actually
 * enforces it, server-side. The disabled button below is a courtesy, not the
 * gate: a request that skips this UI entirely is still refused by the action.
 *
 * An AlertDialog, not a Dialog: it is deliberately not dismissible by clicking
 * away or pressing Escape into a half-answered state — the agent chooses.
 *
 * Reused by every module (M0 §7 "provides → all"). The first production consumer
 * is M0.2's tax-rate change ("This will recompute N deals…"); M0.3 uses it for
 * blocked deletes, M0.4 for account deletion, M1/M4/M5 for money restatements.
 *
 * USE IT ONLY where the PRD calls for one. A gate on an ordinary edit teaches
 * the agent to click through without reading, which breaks it for the case that
 * matters.
 */

export type ConfirmGateProps = {
  /** The element that opens the dialog — usually a <Button>. */
  trigger: React.ReactElement;
  title: string;
  /** What is about to happen, in the agent's terms. */
  description: React.ReactNode;
  /**
   * The consequence, stated plainly and quantified where possible:
   * "This will recompute 12 deals — booked GCI figures will change."
   */
  consequence?: React.ReactNode;
  gate: FrictionGate;
  confirmLabel: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Renders the confirm button in the destructive treatment. */
  destructive?: boolean;
  /** Hidden inputs carrying the action's payload. */
  children?: React.ReactNode;
  testId?: string;
};

export function ConfirmGate({
  trigger,
  title,
  description,
  consequence,
  gate,
  confirmLabel,
  action,
  destructive = false,
  children,
  testId = "confirm-gate",
}: ConfirmGateProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const fieldId = useId();

  const satisfied =
    gate.mode === "typed" ? typed.trim() === gate.phrase : checked;

  // A completed action closes the dialog. Actions that navigate (redirect) never
  // get here, which is fine — the page is gone.
  useEffect(() => {
    if (state.message) setOpen(false);
  }, [state.message]);

  // Reopening must not inherit the last attempt's answer, or the second
  // confirmation is one click — exactly the friction this exists to create.
  useEffect(() => {
    if (!open) {
      setTyped("");
      setChecked(false);
    }
  }, [open]);

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger
        data-testid={`${testId}-trigger`}
        render={trigger}
      />

      <AlertDialog.Portal>
        <AlertDialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/20 transition-opacity duration-150",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
            "supports-backdrop-filter:backdrop-blur-xs"
          )}
        />
        <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <AlertDialog.Popup
            data-testid={testId}
            className={cn(
              "relative flex w-full max-w-md flex-col gap-4 rounded-xl border bg-popover p-5",
              "text-sm text-popover-foreground shadow-lg transition duration-150",
              "data-ending-style:scale-95 data-ending-style:opacity-0",
              "data-starting-style:scale-95 data-starting-style:opacity-0"
            )}
          >
            <div className="flex gap-3">
              {destructive && (
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              )}
              <div className="space-y-1.5">
                <AlertDialog.Title className="font-heading text-base font-medium tracking-tight">
                  {title}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-pretty text-muted-foreground">
                  {description}
                </AlertDialog.Description>
              </div>
            </div>

            {consequence && (
              <div
                data-testid={`${testId}-consequence`}
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-pretty"
              >
                {consequence}
              </div>
            )}

            <form action={formAction} className="space-y-4">
              {children}

              {state.error && (
                <p
                  role="alert"
                  data-testid={`${testId}-error`}
                  className="text-sm text-destructive"
                >
                  {state.error}
                </p>
              )}

              {gate.mode === "typed" ? (
                <div className="space-y-1.5">
                  <Label htmlFor={fieldId}>
                    Type <span className="font-medium">{gate.phrase}</span> to
                    confirm
                  </Label>
                  <Input
                    id={fieldId}
                    name={CONFIRMATION_FIELD}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                    // A phone keyboard would otherwise capitalise the first
                    // letter and quietly fail the exact match.
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-testid={`${testId}-input`}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id={fieldId}
                    name={CONFIRMATION_FIELD}
                    value={CHECKED_VALUE}
                    checked={checked}
                    onCheckedChange={setChecked}
                    className="mt-0.5"
                    data-testid={`${testId}-checkbox`}
                  />
                  <Label htmlFor={fieldId} className="text-sm font-normal">
                    I understand and want to continue.
                  </Label>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Close
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      data-testid={`${testId}-cancel`}
                    />
                  }
                >
                  Cancel
                </AlertDialog.Close>
                <Button
                  type="submit"
                  variant={destructive ? "destructive" : "default"}
                  disabled={!satisfied || pending}
                  data-testid={`${testId}-confirm`}
                >
                  {pending ? "Working…" : confirmLabel}
                </Button>
              </div>
            </form>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
