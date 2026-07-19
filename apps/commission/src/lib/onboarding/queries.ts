import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { OnboardingStateView } from "./steps";

/**
 * The workspace's OnboardingState (M10 §3.1), get-or-created.
 *
 * Calls the idempotent `ensure_onboarding_state` RPC so a member never finds a
 * missing row — new signups get theirs from the on_workspace_created trigger,
 * and any older workspace self-heals here. RLS scopes everything to the caller's
 * workspace (no workspace_id parameter — nothing to forge).
 *
 * Returns null only when there is no authenticated workspace context (the caller
 * redirects to login in that case, same as every other read).
 */
export async function getOnboardingState(): Promise<OnboardingStateView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_onboarding_state");

  if (error) {
    // A missing workspace/session surfaces as a thrown RPC error; treat it as
    // "no context" rather than a 500, matching the layout's redirect-to-login.
    return null;
  }

  return data as unknown as OnboardingStateView;
}
