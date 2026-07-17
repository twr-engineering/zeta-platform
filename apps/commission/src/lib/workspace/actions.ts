"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { diffFields, writeAuditEntry } from "@/lib/audit/write";
import { getWorkspaceContext } from "./queries";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Workspace mutations (M0 §3.1, FR-M0-02: the name is defaulted at signup and
 * editable afterwards).
 *
 * Renaming is audited (rule 12) but deliberately NOT friction-gated: rule 9
 * reserves gates for destructive and money-restating actions, and a name change
 * is neither. Gating it would spend the agent's attention on the one action that
 * cannot hurt them.
 */

// Mirrors the DB constraints exactly (workspace_name_not_blank,
// workspace_name_max_len). Validating here as well turns a Postgres constraint
// violation into a sentence the agent can act on.
const renameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name cannot be empty.")
    .max(120, "Workspace names cannot exceed 120 characters."),
});

export async function renameWorkspace(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
    };
  }

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  const parsed = renameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  const previousName = context.workspace.name;
  const nextName = parsed.data.name;

  // No write, no audit entry — an entry recording "name: X → X" would be noise
  // in a trail whose whole job is to show what actually changed.
  if (previousName === nextName) {
    return { error: null, message: "That is already the workspace name." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspace")
    .update({ name: nextName })
    .eq("id", context.workspace.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: `Could not rename the workspace: ${error.message}` };

  // RLS refuses a non-member's UPDATE by matching zero rows rather than by
  // erroring (verified live against the hosted project) — so "no error" is not
  // the same as "it happened", and only `data` proves the write landed.
  if (!data) {
    return { error: "Workspace could not be updated. Sign in again and retry." };
  }

  try {
    await writeAuditEntry({
      workspaceId: context.workspace.id,
      actorUserId: context.userId,
      entityType: "workspace",
      entityId: context.workspace.id,
      action: "update",
      fieldChanges: diffFields(
        { name: previousName },
        { name: nextName }
      ),
    });
  } catch {
    // The rename landed but the trail did not, which rule 12 forbids. Say so
    // rather than report success — a silently unaudited change is the failure
    // this log exists to prevent.
    return {
      error:
        "Renamed, but the audit entry could not be written. Please report this before making further changes.",
    };
  }

  // The workspace name is in the header, which lives in the layout.
  revalidatePath("/", "layout");

  return { error: null, message: `Workspace renamed to "${nextName}".` };
}
