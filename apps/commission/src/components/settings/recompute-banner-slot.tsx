import { isSupabaseConfigured } from "@/lib/supabase/env";
import { pendingRecomputeJobs } from "@/lib/settings/recompute-runner";
import { RecomputeBanner } from "./recompute-banner";

/**
 * Server slot for the recompute banner: reads the workspace's outstanding
 * recompute jobs and hands them to the client driver. Renders nothing when the
 * queue is empty (the common case — restating changes drain in the action), so
 * it costs one RLS-scoped read and no markup otherwise.
 */
export async function RecomputeBannerSlot() {
  if (!isSupabaseConfigured()) return null;

  let jobs;
  try {
    jobs = await pendingRecomputeJobs();
  } catch {
    // A settings screen must still render if the recompute read hiccups.
    return null;
  }

  if (jobs.length === 0) return null;
  return <RecomputeBanner jobs={jobs} />;
}
