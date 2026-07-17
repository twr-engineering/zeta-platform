import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Profile, TaxSettings, Workspace } from "@/types/database";

/**
 * Reads for the signed-in agent's workspace.
 *
 * Note there is no `workspace_id` filter anywhere below. That is not an
 * oversight: RLS scopes every row to the caller's membership in the database
 * (M0 rule 1). A client-side filter would be the *second* line of defence, and
 * relying on one would invite the mistake of it becoming the only one.
 */

export type WorkspaceContext = {
  userId: string;
  email: string;
  profile: Profile | null;
  workspace: Workspace;
  taxSettings: TaxSettings | null;
};

/**
 * `cache` dedupes this across a single render pass, so the layout and its pages
 * share one round trip.
 */
export const getWorkspaceContext = cache(
  async (): Promise<WorkspaceContext | null> => {
    const supabase = await createClient();

    // getUser() revalidates the JWT against Supabase. getSession() would trust
    // a cookie the client could have forged — never use it for authorization.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const [profileResult, workspaceResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("workspace").select("*").limit(1).maybeSingle(),
    ]);

    const workspace = workspaceResult.data;

    // The signup bootstrap creates the workspace in the same transaction as the
    // user, so this is unreachable in practice — but a null here means the
    // trigger did not run, and silently rendering an empty shell would hide that.
    if (!workspace) return null;

    const { data: taxSettings } = await supabase
      .from("tax_settings")
      .select("*")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    return {
      userId: user.id,
      email: user.email ?? "",
      profile: profileResult.data,
      workspace,
      taxSettings: taxSettings ?? null,
    };
  }
);
