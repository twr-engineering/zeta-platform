"use client";

import { useActionState, useState } from "react";

import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import { renameWorkspace } from "@/lib/workspace/actions";
import { IDLE } from "@/lib/forms/action-state";

/**
 * Rename the workspace (M0 §3.1 — the name is owner-editable; FR-M0-02).
 *
 * Blue input affordance: the agent types here, and the product-wide
 * input-vs-computed contract (Master PRD §4.4) says that must be visible.
 *
 * No friction gate — rule 9 reserves those for destructive and money-restating
 * actions. The change is audited all the same (rule 12).
 */
export function RenameWorkspaceForm({ currentName }: { currentName: string }) {
  const [state, formAction] = useActionState(renameWorkspace, IDLE);

  // Controlled, seeded once from the saved name.
  //
  // It was uncontrolled with a defaultValue, for a good reason: a rejected
  // rename must leave what the agent typed on screen rather than snapping back
  // to the saved name and hiding what they were trying to do. Local state keeps
  // that property and drops the cost — a successful rename revalidates the
  // layout, which changes `currentName` under an uncontrolled input, and Base
  // UI rightly warns that its "initial" value is now a lie.
  //
  // NOT fixed by keying this component on the saved name: that remounts it on
  // success, which resets useActionState and destroys the success message the
  // agent needs. (Tried; the e2e suite caught it.)
  const [name, setName] = useState(currentName);

  return (
    <form action={formAction} className="space-y-4">
      <FormStatus state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <InputField
          id="workspace-name"
          name="name"
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="workspace-name-input"
        />
        <p className="text-xs text-muted-foreground">
          Shown in the app header. Defaults to your name at signup — this is your
          book of business, so call it whatever you call it.
        </p>
      </div>

      <SubmitButton pendingLabel="Saving…" data-testid="rename-workspace-button">
        Save name
      </SubmitButton>
    </form>
  );
}
