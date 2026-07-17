import "server-only";

import { createClient } from "@/lib/supabase/server";
import { RECEIVABLE_SELECT } from "@/lib/supabase/selects";
import { manilaToday, type CivilDate } from "@/lib/date/manila";
import { computeAgeMonths, computeMonthsIdle, compareChasePriority } from "./idle";
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
 * Overlay the today-dependent Rule P fields (months_idle, age_months) with values
 * computed live against `today` (M4.2 — they are not stored, because no event fires
 * as the clock advances). Every read that surfaces idle/age goes through here, so
 * the ledger and chase list can never show a stale month count.
 */
function withLiveIdle(row: ReceivableRow, today: CivilDate): ReceivableRow {
  return {
    ...row,
    months_idle: computeMonthsIdle(row, today),
    age_months: computeAgeMonths(row, today),
  };
}

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
  /** The Manila civil date idle/age resolve against. Injectable for tests. */
  today?: CivilDate;
};

/**
 * The receivables ledger, default-sorted by Rule Q chase priority (balance DESC,
 * months_idle DESC NULLS LAST, deal_code). Balance and the payment dates come off
 * the row (M4.2 projected them); months_idle/age_months are overlaid live against
 * `today`. The DB returns the coarse chase order (chase_priority = balance); the
 * full three-key sort — including the live months_idle tiebreaker the stored key
 * cannot carry — is applied here. RLS scopes it to the caller.
 */
export async function listReceivables(
  options: ListReceivablesOptions = {}
): Promise<ReceivableRow[]> {
  const supabase = await createClient();
  const today = options.today ?? manilaToday();

  let query = supabase.from("receivable").select(RECEIVABLE_LIST_SELECT);
  if (!options.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("chase_priority", { ascending: false, nullsFirst: false })
    .order("deal_code", { ascending: true })
    .returns<ReceivableRow[]>();

  if (error) throw new Error(`Could not read your receivables: ${error.message}`);

  return (data ?? [])
    .map((row) => withLiveIdle(row, today))
    .sort(compareChasePriority);
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
  return data ? withLiveIdle(data, manilaToday()) : null;
}
