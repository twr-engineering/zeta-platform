import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEAL_SELECT } from "@/lib/supabase/selects";
import type { PropertyVatRule, CommBase } from "@/lib/engine";
import type { Deal } from "@/types/entities";
import type { DealComputeRefs } from "./map";
import type { DealInput } from "./schema";

/**
 * Deal reads (FR-M1-02, FR-M1-12) and the reference resolution the write path
 * needs. No `workspace_id` filter anywhere: RLS scopes every row to the caller's
 * membership (M0 rule 1), the same discipline as every other query file.
 */

export type ListDealsOptions = {
  /** Include soft-deleted deals (the archived view). Default false. */
  includeArchived?: boolean;
  /** Filter to a single booking year (§4 rule 19). */
  year?: number;
};

/** The deal list, default sort booked_date desc (FR-M1-02). */
export async function listDeals(options: ListDealsOptions = {}): Promise<Deal[]> {
  const supabase = await createClient();
  let query = supabase.from("deal").select(DEAL_SELECT);

  if (!options.includeArchived) query = query.is("archived_at", null);
  if (options.year !== undefined) query = query.eq("booked_year", options.year);

  const { data, error } = await query
    .order("booked_date", { ascending: false })
    .order("deal_code", { ascending: false })
    .returns<Deal[]>();

  if (error) throw new Error(`Could not read your deals: ${error.message}`);
  return data ?? [];
}

/** A single deal by id, or null (RLS makes another tenant's deal invisible). */
export async function getDeal(id: string): Promise<Deal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal")
    .select(DEAL_SELECT)
    .eq("id", id)
    .maybeSingle<Deal>();

  if (error) throw new Error(`Could not read that deal: ${error.message}`);
  return data ?? null;
}

/**
 * The two references the engine needs beyond the deal's own inputs (Rules A, C):
 * PropertyType.vat_rule and — for developer deals — Developer.comm_base. Read
 * from the database so a tampered client cannot claim, say, that an Always-Exempt
 * type is Always-VAT. RLS confines both reads to the caller's workspace.
 *
 * The lookups do NOT filter on archived_at: rule 15 — a deal may legitimately
 * reference an item archived after it was first booked, and it keeps computing
 * with that item's stored rule. New-deal forms only offer active items, but that
 * is the UI's job (M1.3), not a constraint the compute path re-imposes.
 */
export async function resolveDealRefs(
  input: DealInput
): Promise<{ ok: true; refs: DealComputeRefs } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: propertyType, error: ptError } = await supabase
    .from("property_type")
    .select("vat_rule")
    .eq("id", input.property_type_id)
    .maybeSingle<{ vat_rule: PropertyVatRule }>();

  if (ptError) return { ok: false, error: `Could not read the property type: ${ptError.message}` };
  if (!propertyType) return { ok: false, error: "That property type no longer exists." };

  let developer_comm_base: CommBase | null = null;
  if (input.developer_id) {
    const { data: developer, error: devError } = await supabase
      .from("developer")
      .select("comm_base")
      .eq("id", input.developer_id)
      .maybeSingle<{ comm_base: CommBase }>();

    if (devError) return { ok: false, error: `Could not read the developer: ${devError.message}` };
    if (!developer) return { ok: false, error: "That developer no longer exists." };
    developer_comm_base = developer.comm_base;
  }

  return {
    ok: true,
    refs: { property_vat_rule: propertyType.vat_rule, developer_comm_base },
  };
}

/**
 * How many payments are logged against a deal — the delete-protection / edit-
 * friction / archive-cascade signal (§4 rule 2).
 *
 * ZERO, ALWAYS, IN M1.2 — mirrors app.deal_payment_count in SQL and
 * countAffectedDeals() in M0.2: there is no payment table until M5. When M5
 * lands this becomes a real count (a select over payment.deal_id, or a public
 * wrapper RPC), and the edit-after-payments friction gate and archive-cascade
 * copy start firing with no change to the actions that already consult it.
 */
export async function dealPaymentCount(dealId: string): Promise<number> {
  // Referenced so the stub carries the exact shape M5 fills in (a count over
  // payment.deal_id); there is no payment table to query yet.
  void dealId;
  return 0;
}
