import "server-only";

import { createClient } from "@/lib/supabase/server";
import { AUDIT_LOG_SELECT, DEAL_SELECT } from "@/lib/supabase/selects";
import { equalsToCentavo } from "@/lib/money";
import type { PropertyVatRule, CommBase } from "@/lib/engine";
import type { AuditLogEntry, Deal } from "@/types/entities";
import type { DuplicateMatch } from "./deal-warnings";
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
 * A single deal by its permanent code (D021), or null. The detail and edit
 * routes are keyed on the code, not the UUID: it is the stable, human name the
 * agent knows (§4 rule 1), it survives across sessions, and it makes a shareable
 * URL. RLS still scopes the row to the caller.
 */
export async function getDealByCode(code: string): Promise<Deal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal")
    .select(DEAL_SELECT)
    .eq("deal_code", code)
    .maybeSingle<Deal>();

  if (error) throw new Error(`Could not read that deal: ${error.message}`);
  return data ?? null;
}

/**
 * The soft duplicate guard (§4 rule 18, FR-M1-11): same client + property
 * details + list price within a 30-day window is a *possible* duplicate, never a
 * blocked one (D013/D014/D015 prove same-buyer, same-day deals are legitimate).
 *
 * The client-name and property match case-insensitively; the list price is
 * compared to the centavo through the Money lib rather than by string, so
 * "8000000" and "8000000.00" are the same price. A deal being edited excludes
 * itself via `excludeId`.
 */
export async function findPossibleDuplicates(
  input: DealInput,
  excludeId?: string
): Promise<DuplicateMatch[]> {
  const booked = new Date(`${input.booked_date}T00:00:00Z`);
  if (Number.isNaN(booked.getTime())) return [];
  const windowDays = 30;
  const from = new Date(booked);
  from.setUTCDate(from.getUTCDate() - windowDays);
  const to = new Date(booked);
  to.setUTCDate(to.getUTCDate() + windowDays);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal")
    .select("id,deal_code,booked_date,client_name,property_details,list_price::text")
    .is("archived_at", null)
    .gte("booked_date", iso(from))
    .lte("booked_date", iso(to))
    .ilike("client_name", input.client_name)
    .returns<
      Pick<Deal, "id" | "deal_code" | "booked_date" | "client_name" | "property_details" | "list_price">[]
    >();

  if (error) throw new Error(`Could not check for duplicates: ${error.message}`);

  const details = input.property_details.trim().toLowerCase();
  return (data ?? [])
    .filter((row) => row.id !== excludeId)
    .filter(
      (row) =>
        row.property_details.trim().toLowerCase() === details &&
        equalsToCentavo(row.list_price, input.list_price)
    )
    .map((row) => ({ deal_code: row.deal_code, booked_date: row.booked_date }));
}

/**
 * The deal's own audit trail (rule 12, edge case 13) for the detail view — every
 * field-level change, newest first. Reads the same append-only `audit_log_entry`
 * the global viewer reads, filtered to this deal; RLS scopes it to the caller.
 */
export async function dealAuditHistory(
  dealId: string,
  limit = 50
): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log_entry")
    .select(AUDIT_LOG_SELECT)
    .eq("entity_type", "deal")
    .eq("entity_id", dealId)
    .order("occurred_at", { ascending: false })
    .limit(limit)
    .returns<AuditLogEntry[]>();

  if (error) throw new Error(`Could not read the deal's history: ${error.message}`);
  return data ?? [];
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
 * REAL SINCE M5.1 — a count over payment.deal_id (mirroring app.deal_payment_count
 * in SQL), which turns on the edit-after-payments friction gate and the archive-
 * cascade copy in the deal actions that already consult it, with no change there.
 * Counts ALL payment rows (archived included): a soft-deleted payment still has an
 * event + a receivable restatement in history, so the deal stays un-hard-deletable
 * (archive it instead). RLS scopes the read to the caller's workspace.
 */
export async function dealPaymentCount(dealId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("payment")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId);

  if (error) throw new Error(`Could not count the deal's payments: ${error.message}`);
  return count ?? 0;
}
