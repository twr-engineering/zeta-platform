import "server-only";

import { createClient } from "@/lib/supabase/server";
import { SETTINGS_CHANGE_EVENT_SELECT } from "@/lib/supabase/selects";
import type { SettingsChangeEvent } from "@/types/entities";
import type { TaxField } from "./tax";

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
 * The restatement matrix (M1 PRD §4 rule 3), addressed the way the DB predicate
 * `app.affected_deals` reads it. Which deals a settings change restates:
 *
 *   - a tax rate / registration change (vat_rate, ewt_rate, vat_registered)
 *     restates every taxable deal;
 *   - a threshold change restates threshold-rule developer deals;
 *   - a developer's commission-base change restates that developer's deals;
 *   - a property type's VAT-rule change restates that type's deals.
 */
export type SettingsChangeScope =
  | { entity: "tax_settings"; fields: readonly TaxField[] }
  | { entity: "developer"; developerId: string }
  | { entity: "property_type"; propertyTypeId: string };

/**
 * How many existing deals a settings change would restate — real, at last.
 *
 * M0.2 shipped this returning 0 (no deals existed) and named it as the one
 * function M1 turns on. It now calls `count_affected_deals`, the SQL that both
 * the confirmation copy and the recompute job read, so the number the agent is
 * shown and the set actually recomputed cannot drift. RLS scopes the count to
 * the caller's workspace — no workspace id crosses the boundary.
 */
export async function countAffectedDeals(scope: SettingsChangeScope): Promise<number> {
  const supabase = await createClient();

  const args =
    scope.entity === "tax_settings"
      ? { p_entity_type: "tax_settings", p_entity_id: null, p_fields: [...scope.fields] }
      : scope.entity === "developer"
        ? { p_entity_type: "developer", p_entity_id: scope.developerId, p_fields: [] }
        : { p_entity_type: "property_type", p_entity_id: scope.propertyTypeId, p_fields: [] };

  const { data, error } = await supabase.rpc("count_affected_deals", args);
  if (error) {
    throw new Error(`Could not count the affected deals: ${error.message}`);
  }
  return data ?? 0;
}

/**
 * The two counts the Tax Settings confirmation needs, computed once on the
 * server and handed to the form so it can state an honest consequence for
 * whichever restating field the agent is actually changing:
 *
 *   - `rate` — deals restated by a vat_rate / ewt_rate / vat_registered change
 *     (every taxable deal);
 *   - `threshold` — deals restated by a property-VAT-threshold change (threshold-
 *     rule developer deals, all of which are already inside `rate`, since a
 *     developer deal is always taxable).
 *
 * So the union of "rate + threshold changed together" is just `rate`, and the
 * form picks `rate` whenever a rate field is in play and `threshold` only when
 * the threshold is the sole restating change (see @/components/settings).
 */
export type TaxAffectedCounts = { rate: number; threshold: number };

export async function taxAffectedCounts(): Promise<TaxAffectedCounts> {
  const [rate, threshold] = await Promise.all([
    countAffectedDeals({ entity: "tax_settings", fields: ["vat_rate"] }),
    countAffectedDeals({ entity: "tax_settings", fields: ["property_vat_threshold"] }),
  ]);
  return { rate, threshold };
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
