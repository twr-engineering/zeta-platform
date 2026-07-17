"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { CircleCheck } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { signIn, type ActionState } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/routes";

const INITIAL: ActionState = { error: null };

/**
 * Notices the account flows (M0.4) redirect here to show. A password change
 * signs the agent out globally and a deletion ends the account — both land back
 * on sign-in, and neither should do so silently.
 */
const NOTICES: Record<string, string> = {
  "password-changed":
    "Your password was changed and every session was signed out. Sign in with your new password.",
  "account-deleted":
    "Your account and workspace were permanently deleted. Thanks for using ZETA.",
};

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, INITIAL);
  const searchParams = useSearchParams();
  // Where middleware bounced them from; sanitized server-side before use.
  const next = searchParams.get("next");
  const notice = NOTICES[searchParams.get("notice") ?? ""];

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {notice && !state.error && (
        <Alert data-testid="login-notice">
          <CircleCheck />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href={ROUTES.resetPassword}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <InputField
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          affordance="plain"
          data-testid="password-input"
        />
      </div>

      <SubmitButton
        className="w-full"
        pendingLabel="Signing in…"
        data-testid="sign-in-button"
      >
        Sign in
      </SubmitButton>
    </form>
  );
}
