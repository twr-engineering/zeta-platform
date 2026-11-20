import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "./env";
import type { Database } from "@/types/database";

/**
 * Server client for Server Components, Server Actions and Route Handlers.
 *
 * Awaiting `cookies()` opts the caller into dynamic rendering, which is also
 * what keeps `next build` from prerendering (and thus constructing a client for)
 * any authenticated page.
 */
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component: middleware refreshes the session
          // instead, so this is safe to swallow.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. Server-only, and never for request paths
 * driven by user input. Reserved for admin/maintenance jobs (bulk recompute,
 * import) that must run outside tenant scoping.
 */
export async function createServiceRoleClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey || serviceRoleKey === "PLACEHOLDER_PENDING_CREDENTIALS") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createServerClient<Database>(url, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Service-role client is stateless; it carries no user session.
      },
    },
  });
}
