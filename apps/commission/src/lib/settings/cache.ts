import { revalidateTag, unstable_cache } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { TAX_SETTINGS_SELECT } from "@/lib/supabase/selects";
import type { TaxSettings } from "@/types/entities";

/**
 * The settings read cache (M0 §8: "Settings reads are hot-path — every deal
 * computation — serve from cache ≤ 5 ms in-region; invalidate on write").
 *
 * WHY THIS IS WORTH CACHING AT ALL
 *
 * Today one page reads this row and a round trip would be fine. M1 is why it
 * exists: the engine reads vat_rate/ewt_rate/threshold for *every deal it
 * computes*, and a per-deal round trip to Postgres is the difference between a
 * list that renders and a list that crawls at the PRD's 1,000-deal target.
 *
 * HOW TENANT ISOLATION SURVIVES A CACHE — read this before adding a second one
 *
 * `unstable_cache` keys on `keyParts`. A cache HIT returns the stored value
 * without running the callback, so **RLS is not consulted on a hit** — the cache
 * key is the isolation boundary, not the database.
 *
 * That is safe here for exactly one reason: `workspaceId` is never user input.
 * It comes from `getWorkspaceContext()`, which derives it from a JWT verified by
 * `auth.getUser()`. Pass a workspace id that came from a query string or a form
 * field and this function will happily serve you another agent's rates.
 *
 * Two things follow, and neither is optional:
 *   - The Supabase client is built OUTSIDE the cached callback. `cookies()`
 *     cannot be called inside one — and building it outside also means a cache
 *     MISS still reads through RLS with the caller's own token, so the database
 *     independently agrees the row is theirs. The key is the fast path; RLS is
 *     still the correctness path.
 *   - Every write MUST call `invalidateTaxSettings`. The `revalidate` window
 *     below is a backstop against a missed invalidation, not the mechanism —
 *     an agent who changes their EWT rate and sees the old one for five minutes
 *     will assume the save failed and change it again.
 */

/** One tag per workspace: invalidating one agent's rates must not touch anyone else's. */
export function taxSettingsTag(workspaceId: string): string {
  return `tax-settings:${workspaceId}`;
}

/**
 * `workspaceId` MUST come from an authenticated context (`getWorkspaceContext`).
 * See the note above — this parameter is the tenant boundary.
 */
export async function getCachedTaxSettings(
  workspaceId: string
): Promise<TaxSettings | null> {
  // Built here, deliberately: cookies() is a dynamic API and unusable inside
  // unstable_cache. On a miss the closure uses this client, so the read still
  // passes RLS.
  const supabase = await createClient();

  const load = unstable_cache(
    async (): Promise<TaxSettings | null> => {
      // TAX_SETTINGS_SELECT, not "*" — PostgREST would return the rates as JSON
      // numbers, i.e. floats (see @/lib/supabase/selects). The cache stores
      // whatever this returns, so a float here would be a float cached for
      // every subsequent read.
      const { data, error } = await supabase
        .from("tax_settings")
        .select(TAX_SETTINGS_SELECT)
        .eq("workspace_id", workspaceId)
        .maybeSingle<TaxSettings>();

      // Never cache a failure as "no settings": the tax screen renders a
      // "trigger did not run" alarm for null, and a transient network blip must
      // not masquerade as a broken bootstrap for the next five minutes.
      if (error) {
        throw new Error(`Could not read tax settings: ${error.message}`);
      }

      return data ?? null;
    },
    ["tax-settings", workspaceId],
    {
      tags: [taxSettingsTag(workspaceId)],
      // Backstop only. Correctness comes from invalidateTaxSettings().
      revalidate: 300,
    }
  );

  return load();
}

/**
 * Call after every successful settings write, with the same workspace id.
 *
 * Server Actions only (revalidateTag is a no-op outside a request that can
 * mutate). The tax settings write path calls this — see
 * @/lib/settings/actions.
 */
export function invalidateTaxSettings(workspaceId: string): void {
  revalidateTag(taxSettingsTag(workspaceId));
}
