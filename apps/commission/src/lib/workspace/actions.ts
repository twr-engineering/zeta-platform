"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ROUTES } from "@/lib/routes";
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
 *
 * M0.1 shipped this as update-then-audit and flagged the hole: two PostgREST
 * calls are two transactions, so a failed entry insert left an unaudited change
 * (rule 12). M0.2 owns the durable write path, so the rename now goes through
 * `rename_workspace`, which does both in one transaction. There are no callers
 * left on the old pattern — and @/lib/audit/write is gone rather than left
 * lying around to be imported by the next module.
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

  const nextName = parsed.data.name;
  const supabase = await createClient();

  // Rename + audit entry, one transaction. The function diffs against the row
  // it locks, so a no-op rename writes nothing — an entry recording
  // "name: X → X" would be noise in a trail whose whole job is showing what
  // actually changed.
  const { data, error } = await supabase.rpc("rename_workspace", {
    p_name: nextName,
  });

  if (error) {
    if (error.message.includes("workspace_name_not_blank")) {
      return { error: "Workspace name cannot be empty." };
    }
    if (error.message.includes("workspace_name_max_len")) {
      return { error: "Workspace names cannot exceed 120 characters." };
    }
    return { error: `Could not rename the workspace: ${error.message}` };
  }

  const result = data as { changed: boolean; name: string } | null;

  // RLS refuses a non-member by matching zero rows rather than erroring
  // (verified live against the hosted project), and the function turns that
  // into "not found" — so "no error" is still not the same as "it happened".
  if (!result) {
    return { error: "Workspace could not be updated. Sign in again and retry." };
  }

  if (!result.changed) {
    return { error: null, message: "That is already the workspace name." };
  }

  // The workspace name is in the header, which lives in the layout.
  revalidatePath("/", "layout");
  revalidatePath(ROUTES.settingsAuditLog);

  return { error: null, message: `Workspace renamed to "${result.name}".` };
}
