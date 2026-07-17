import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEAL_SELECT, PAYMENT_SELECT } from "@/lib/supabase/selects";
import { equalsToCentavo } from "@/lib/money";
import type { Deal, Payment } from "@/types/entities";
import type { DuplicatePaymentMatch } from "./warnings";

/**
 * Payment reads (FR-M5-05/06) and the deal resolution the write path needs. No
 * `workspace_id` filter anywhere: RLS scopes every row to the caller's membership
 * (M0 rule 1), the same discipline as every query file.
 *
 * The list/per-deal reads join the *current* deal identity (renames propagate) —
 * only the tax split is the stored snapshot (§3.1). The money-dense payment
 * columns come through PAYMENT_SELECT's `::text` casts, so every centavo survives.
 */

/**
 * A payment joined to its deal's current identity — enough for the payments list
 * and the exporter. Split columns are the stored snapshot; the deal columns are
 * live (a rename shows immediately).
 */
export type PaymentRow = Payment & {
  deal: {
    deal_code: string;
    booked_year: number;
    client_name: string;
    property_details: string;
    deal_type: Deal["deal_type"];
    developer: { name: string } | null;
  } | null;
};

const PAYMENT_LIST_SELECT = `${PAYMENT_SELECT},deal:deal_id(deal_code,booked_year,client_name,property_details,deal_type,developer:developer_id(name))`;

export type ListPaymentsOptions = {
  /** Include soft-deleted payments. Default false. */
  includeArchived?: boolean;
  /** Restrict to a single deal (the per-deal panel, FR-M5-06). */
  dealId?: string;
};

/** The payments list, default sort payment_date newest first (§6.2, rule 18). */
export async function listPayments(
  options: ListPaymentsOptions = {}
): Promise<PaymentRow[]> {
  const supabase = await createClient();
  let query = supabase.from("payment").select(PAYMENT_LIST_SELECT);

  if (!options.includeArchived) query = query.is("archived_at", null);
  if (options.dealId) query = query.eq("deal_id", options.dealId);

  const { data, error } = await query
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<PaymentRow[]>();

  if (error) throw new Error(`Could not read your payments: ${error.message}`);
  return data ?? [];
}

/** A single payment by id, or null (RLS makes another tenant's payment invisible). */
export async function getPayment(id: string): Promise<Payment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment")
    .select(PAYMENT_SELECT)
    .eq("id", id)
    .maybeSingle<Payment>();

  if (error) throw new Error(`Could not read that payment: ${error.message}`);
  return data ?? null;
}

/**
 * Resolve the referenced deal for the split (§3.2) and re-affirm referential
 * integrity in the app before the round-trip (edge case 10): the deal must exist,
 * be in the caller's workspace (RLS makes another tenant's invisible → null), and
 * be non-archived. The DB function re-checks the same thing as the single writer;
 * this gives a clear message and the deal row the engine needs, without trusting
 * anything from the client.
 */
export async function resolvePaymentDeal(
  dealId: string
): Promise<{ ok: true; deal: Deal } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal")
    .select(DEAL_SELECT)
    .eq("id", dealId)
    .maybeSingle<Deal>();

  if (error) return { ok: false, error: `Could not read that deal: ${error.message}` };
  if (!data) {
    return { ok: false, error: "That deal no longer exists, or is not in this workspace." };
  }
  if (data.archived_at !== null) {
    return { ok: false, error: "That deal is archived — restore it before logging a payment against it." };
  }
  return { ok: true, deal: data };
}

/**
 * The soft duplicate guard (rule 3, FR-M5-04): an existing ACTIVE payment with the
 * same deal + gross + date. Never blocks — legitimate identical tranches exist —
 * it only produces the amber "possible duplicate" warning. Gross is compared to
 * the centavo through the Money lib, not by string. A payment being edited
 * excludes itself via `excludeId`.
 */
export async function findDuplicatePayments(
  dealId: string,
  gross: string,
  paymentDate: string,
  excludeId?: string
): Promise<DuplicatePaymentMatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment")
    .select("id,payment_date,gross_amount::text")
    .eq("deal_id", dealId)
    .eq("payment_date", paymentDate)
    .is("archived_at", null)
    .returns<{ id: string; payment_date: string; gross_amount: string }[]>();

  if (error) throw new Error(`Could not check for duplicate payments: ${error.message}`);

  return (data ?? [])
    .filter((row) => row.id !== excludeId)
    .filter((row) => equalsToCentavo(row.gross_amount, gross))
    .map((row) => ({ payment_date: row.payment_date, gross_amount: row.gross_amount }));
}
