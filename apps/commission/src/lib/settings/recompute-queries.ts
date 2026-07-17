import "server-only";

import { createClient } from "@/lib/supabase/server";
import { SETTINGS_CHANGE_EVENT_SELECT } from "@/lib/supabase/selects";
import type { SettingsChangeEvent } from "@/types/entities";

/**
 * Server-side reads for the recompute contract. The contract itself — what the
 * queue is for and what M1 inherits — is documented in `./recompute`.
 *
 * `server-only` is deliberate: the confirmation copy next door is imported by a
 * client component, and this file must never follow it into the browser bundle.
 * Without the marker, the next import gets a webpack error about next/headers
 * that reads as a mystery rather than as "you crossed the boundary".
 */

/**
 * How many existing deals a settings change would restate.
 *
 * ZERO, ALWAYS, IN M0.2 — and honestly so: there is no deals table until M1, so
 * the true answer is zero, not unknown. When M1 lands this is the one function
 * to implement (count the workspace's deals that the changed fields feed), and
 * the confirmation copy, the emitted event and the audit trail all start
 * carrying real counts with no other change.
 */
export async function countAffectedDeals(): Promise<number> {
  return 0;
}

/** The pending backlog for the caller's workspace, oldest first. M1 drains this. */
export async function pendingRecomputeEvents(): Promise<SettingsChangeEvent[]> {
  const supabase = await createClient();

  // No workspace_id filter: RLS scopes it (M0 rule 1). Same reasoning as
  // @/lib/workspace/queries.
  const { data, error } = await supabase
    .from("settings_change_event")
    .select(SETTINGS_CHANGE_EVENT_SELECT)
    .is("consumed_at", null)
    .order("occurred_at", { ascending: true })
    .returns<SettingsChangeEvent[]>();

  if (error) {
    throw new Error(`Could not read pending recompute events: ${error.message}`);
  }

  return data ?? [];
}
