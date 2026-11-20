"use client";

import { useActionState, useState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { updateDisplayName } from "@/lib/account/actions";
import { IDLE } from "@/lib/forms/action-state";

/**
 * The display-name edit (M0.4 account screen). Mirrors RenameWorkspaceForm: blue
 * input affordance, controlled from the saved value, no friction gate (a name
 * restates nothing), audited all the same (rule 12).
 */
export function DisplayNameForm({ currentName }: { currentName: string }) {
  const [state, formAction] = useActionState(updateDisplayName, IDLE);

  // Controlled, seeded once. A rejected save must leave what the agent typed on
  // screen rather than snapping back to the stored name (same reasoning as the
  // workspace rename form).
  const [name, setName] = useState(currentName);

  return (
    <form action={formAction} className="space-y-4">
      <FormStatus state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="display-name">Name</Label>
        <InputField
          id="display-name"
          name="displayName"
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="display-name-input"
        />
        <p className="text-xs text-muted-foreground">
          The name you signed up with. It seeded your workspace name and is what
          the app calls you.
        </p>
      </div>

      <SubmitButton pendingLabel="Saving…" data-testid="save-display-name-button">
        Save name
      </SubmitButton>
    </form>
  );
}
