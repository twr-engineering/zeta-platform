"use client";

import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms/action-state";

/** Submit button that reflects the enclosing form's pending state. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Renders whichever of `error` / `message` an action came back with. */
export function FormStatus({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <Alert variant="destructive" data-testid="form-error">
        <CircleAlert />
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }

  if (state.message) {
    return (
      <Alert data-testid="form-message">
        <CircleCheck />
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return null;
}
