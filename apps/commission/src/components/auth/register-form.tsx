"use client";

import { useActionState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { FormStatus, SubmitButton } from "./form-status";
import { signUp, type ActionState } from "@/lib/auth/actions";

const INITIAL: ActionState = { error: null };

export function RegisterForm() {
  const [state, formAction] = useActionState(signUp, INITIAL);

  // On success the action returns a "check your email" message and there is
  // nothing left to fill in — hide the form so the instruction is the only
  // thing on screen.
  if (state.message) return <FormStatus state={state} />;

  return (
    <form action={formAction} className="space-y-4">
      <FormStatus state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="displayName">Your name</Label>
        <InputField
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          required
          affordance="plain"
          placeholder="Juan Dela Cruz"
          data-testid="display-name-input"
        />
        <p className="text-xs text-muted-foreground">
          Used to name your workspace. You can rename it later.
        </p>
      </div>

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

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
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
        pendingLabel="Creating workspace…"
        data-testid="sign-up-button"
      >
        Create your workspace
      </SubmitButton>
    </form>
  );
}
