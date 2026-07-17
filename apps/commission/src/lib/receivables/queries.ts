import "server-only";

import { createClient } from "@/lib/supabase/server";
import { RECEIVABLE_SELECT } from "@/lib/supabase/selects";
import type { Receivable } from "@/types/entities";

/**
 * Receivable reads (M4). No `workspace_id` filter anywhere: RLS scopes every row to
 * the caller's membership (M0 rule 1), the same discipline as every query file.
 *
 * The ledger screen and downstream projections (M4.4/M6/M7/M8) are later milestones;
 * M4.1 provides the entity reads the /collectibles page and the deal cross-link need
 * plus the `payor` derivation the sheet keeps as col S.
 */

/**
 * A receivable joined to its developer's name — enough to render the ledger and to
 * derive `payor`. Payment-derived figures (balance, collected…) are still at their
 * M4.1 defaults; the ledger UI and its money columns arrive with M4.2/M4.4.
 */
export type ReceivableRow = Receivable & {
  developer: { name: string } | null;
};

const RECEIVABLE_LIST_SELECT = `${RECEIVABLE_SELECT},developer:developer_id(name)`;

/**
 * Rule S — the payor (chase-list helper): the developer for a Developer deal, else
 * the client. Derived in the read layer rather than stored, so it can never drift
 * from a developer rename (§4 rule 2).
 */
export function receivablePayor(row: ReceivableRow): string {
  if (row.deal_type === "developer") {
    return row.developer?.name ?? row.client_name;
  }
  return row.client_name;
}

export type ListReceivablesOptions = {
  /** Include receivables whose deal is archived (§4 rule 16). Default false. */
  includeArchived?: boolean;
};

/**
 * The receivables ledger. Default order is a stand-in for Rule Q chase priority —
 * largest Total Collectible first, then the permanent code — until M4.2 computes
 * balance and the real chase key. RLS scopes it to the caller.
 */
export async function listReceivables(
  options: ListReceivablesOptions = {}
): Promise<ReceivableRow[]> {
  const supabase = await createClient();
  let query = supabase.from("receivable").select(RECEIVABLE_LIST_SELECT);

  if (!options.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("total_collectible", { ascending: false })
    .order("deal_code", { ascending: true })
    .returns<ReceivableRow[]>();

  if (error) throw new Error(`Could not read your receivables: ${error.message}`);
  return data ?? [];
}

/** How many active receivables exist — the /collectibles empty-state signal. */
export async function countActiveReceivables(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("receivable")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);

  if (error) throw new Error(`Could not count your receivables: ${error.message}`);
  return count ?? 0;
}

/**
 * A single receivable by its deal (the 1:1 mapping) — the deal detail's cross-link
 * into the ledger. Returns null when none exists yet or the deal is another tenant's.
 */
export async function getReceivableByDealId(
  dealId: string
): Promise<ReceivableRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receivable")
    .select(RECEIVABLE_LIST_SELECT)
    .eq("deal_id", dealId)
    .maybeSingle<ReceivableRow>();

  if (error) throw new Error(`Could not read that receivable: ${error.message}`);
  return data ?? null;
}
