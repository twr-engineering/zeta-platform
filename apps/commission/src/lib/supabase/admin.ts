import "server-only";

import { createClient } from "@supabase/supabase-js";

import { DB_SCHEMA, getSupabaseEnv } from "./env";

/**
 * Service-role admin client — bypasses RLS and carries GoTrue's admin API.
 *
 * SERVER-ONLY, and never constructed on a request path driven by tenant data.
 * The one M0 use is account deletion (FR-M0-10): removing a row from
 * auth.users can only be done with the service role, and only via
 * `auth.admin.deleteUser`. The action that calls this deletes exactly the
 * *authenticated* user's own id (from auth.getUser(), never the payload) behind
 * a typed confirmation — the service role is the capability, the action is the
 * gate.
 *
 * Built on @supabase/supabase-js rather than the SSR client on purpose: this
 * carries no user session and no cookies, so there is no chance of it acting as
 * anything other than the service role.
 */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey || serviceRoleKey === "PLACEHOLDER_PENDING_CREDENTIALS") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient(url, serviceRoleKey, {
    db: { schema: DB_SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
