"use client";

import { useActionState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { updatePassword, type ActionState } from "@/lib/auth/actions";

const INITIAL: ActionState = { error: null };

/** Reached from the emailed reset link, once the recovery session is active. */
export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(updatePassword, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <FormStatus state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <InputField
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          affordance="plain"
          data-testid="password-input"
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      <SubmitButton
        className="w-full"
        pendingLabel="Updating…"
        data-testid="update-password-button"
      >
        Update password
      </SubmitButton>
    </form>
  );
}
