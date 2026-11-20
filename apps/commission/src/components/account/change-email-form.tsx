"use client";

import { useActionState, useState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { changeEmail } from "@/lib/account/actions";
import { IDLE } from "@/lib/forms/action-state";

/**
 * Changing the sign-in email (M0.4). Requires the current password (the same
 * re-authentication the password change uses), and the new address must be
 * confirmed from a link before it takes effect — so the copy says the current
 * email keeps working until then.
 */
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState(changeEmail, IDLE);
  const [email, setEmail] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-4"
      // A confirmed change re-verifies the new address; clear the fields so the
      // form does not sit holding a value that is now pending elsewhere.
      onSubmit={() => setEmail("")}
    >
      <FormStatus state={state} />

      {/* Hidden username field for password managers (the current-password field
          below reads better when the account it belongs to is named). */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={currentEmail}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />

      <div className="space-y-1.5">
        <Label htmlFor="new-email">New email</Label>
        <InputField
          id="new-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={currentEmail}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="new-email-input"
        />
        <p className="text-xs text-muted-foreground">
          Currently {currentEmail}. We email a confirmation link to the new
          address; it becomes your sign-in only once you click it.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email-current-password">Current password</Label>
        <InputField
          id="email-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          affordance="plain"
          data-testid="email-current-password-input"
        />
      </div>

      <SubmitButton pendingLabel="Sending…" data-testid="change-email-button">
        Change email
      </SubmitButton>
    </form>
  );
}
