"use client";

import { useActionState } from "react";

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
          // defaultValue, not value: this is uncontrolled, so a rejected submit
          // leaves what the agent typed on screen instead of snapping back to
          // the saved name and hiding what they were trying to do.
          defaultValue={currentName}
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
