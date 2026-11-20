"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/queries";

/**
 * M10.4 — help-opened instrumentation (FR-M10-18).
 *
 * A single append-only event, `help_opened`, written to the M10.2
 * `onboarding_event` log whenever a doctrine popover opens, tagged with the
 * placement slug it opened on. That is the "doctrine reach" signal the PRD wants
 * (§8) alongside the wizard-timing events — no financial values, ever (§8).
 *
 * Deliberately lightweight and fire-and-forget:
 *   - the caller does NOT await it on the popover's hot path (open < 100 ms, NFR);
 *   - every failure is swallowed here and at the call site — instrumentation must
 *     never break, block, or slow a help popover.
 *
 * `event_type` is free text in the schema (M10.2), so a new kind is a code change
 * with no migration. The insert rides the existing member insert policy (actor
 * pinned to auth.uid(), workspace-membership checked), so no new RPC is needed.
 */
export async function logHelpOpened(placement: string): Promise<void> {
  const slug = placement.trim();
  if (slug === "") return;

  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return; // signed-out / no workspace — nothing to attribute the event to

    const supabase = await createClient();
    await supabase.from("onboarding_event").insert({
      workspace_id: ctx.workspace.id,
      actor_user_id: ctx.userId,
      event_type: "help_opened",
      // A doctrine placement is not a wizard step; leave `step` null (§FR-M10-18).
      step: null,
      metadata: { placement: slug },
    });
  } catch {
    // Instrumentation is best-effort — a failed insert never surfaces to the UI.
  }
}
