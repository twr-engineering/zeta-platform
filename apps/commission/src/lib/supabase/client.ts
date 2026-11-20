import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";
import type { Database } from "@/types/database";

/**
 * Browser client. Call inside components/handlers — never at module scope, so a
 * placeholder-credential build never constructs one.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
