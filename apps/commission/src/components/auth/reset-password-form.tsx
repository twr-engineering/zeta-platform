"use client";

import { useActionState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { requestPasswordReset, type ActionState } from "@/lib/auth/actions";

const INITIAL: ActionState = { error: null };

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, INITIAL);

  if (state.message) return <FormStatus state={state} />;

  return (
    <form action={formAction} className="space-y-4">
      <FormStatus state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <InputField
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          affordance="plain"
          placeholder="you@example.com"
          data-testid="email-input"
        />
      </div>

      <SubmitButton
        className="w-full"
        pendingLabel="Sending…"
        data-testid="reset-password-button"
      >
        Send reset link
      </SubmitButton>
    </form>
  );
}
