"use client";

import { useActionState, useState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { changePassword } from "@/lib/account/actions";
import { IDLE } from "@/lib/forms/action-state";

/**
 * Changing the password (M0.4). Requires the current password (re-auth), and a
 * successful change signs every session out and redirects to the login screen —
 * so there is no success message to render here; the action navigates away.
 *
 * The confirm field is a client-side guard against a typo, checked before the
 * submit is allowed; the server never sees it.
 */
export function ChangePasswordForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState(changePassword, IDLE);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = next.length >= 8 && next === confirm;

  return (
    <form action={formAction} className="space-y-4">
      <FormStatus state={state} />

      {/* A hidden username field so password managers associate the new
          password with this account (and browsers stop warning about a password
          form with no username). The server ignores it — the email is taken
          from the session, never the payload. */}
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
        <Label htmlFor="current-password">Current password</Label>
        <InputField
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          affordance="plain"
          data-testid="current-password-input"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <InputField
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          affordance="plain"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          data-testid="new-password-input"
        />
        <p className="text-xs text-muted-foreground">
          At least 8 characters. Changing it signs you out everywhere — you will
          sign back in with the new password.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <InputField
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          affordance="plain"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={mismatch}
          data-testid="confirm-password-input"
        />
        {mismatch && (
          <p role="alert" className="text-xs text-destructive" data-testid="password-mismatch">
            The two passwords do not match.
          </p>
        )}
      </div>

      <SubmitButton
        pendingLabel="Changing…"
        disabled={!canSubmit}
        data-testid="change-password-button"
      >
        Change password
      </SubmitButton>
    </form>
  );
}
