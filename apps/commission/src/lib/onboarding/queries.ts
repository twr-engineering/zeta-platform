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

/**
 * M10.3 — whether the workspace has sample data on its books, and its code (for the
 * persistent banner + badges, rule 4). Reads the deal table directly (RLS-scoped)
 * so it reflects the real rows, not just the wizard's sample_deal_id pointer — the
 * banner disappears the moment the sample deal is gone (cleanup). Cheap: the
 * partial index deal_sample_idx backs the lookup.
 */
export type SampleStatus = { exists: boolean; sampleDealCode: string | null };

export async function getSampleStatus(): Promise<SampleStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal")
    .select("deal_code")
    .eq("is_sample", true)
    .limit(1);

  if (error || !data || data.length === 0) {
    return { exists: false, sampleDealCode: null };
  }
  return { exists: true, sampleDealCode: data[0].deal_code };
}
