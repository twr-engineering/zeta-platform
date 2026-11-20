import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * M4.3 data-health projections — the receivable-side feeds for M6's Data Health
 * section (WORKBOOK §6.7 checks (b), (c), (d)). Read-only, RLS-scoped, exposed for
 * M6.1 to assemble later; nothing here renders UI.
 *
 * WHAT MAPS TO M4 (and what deliberately does NOT):
 *   (a) "deals with no Status set" — structurally impossible here: every receivable
 *       is system-created with status defaulting to Open (§4 rule 1). M6 keeps (a)
 *       only for imported legacy sheets; M4 has nothing to surface.
 *   (b) fully paid but not Closed — an OPEN receivable whose balance is ≤ 0 (paid in
 *       full or over-collected). The "close it or confirm the collectible" signal
 *       (edge case 12 / §4 rule 9).
 *   (c) Closed short/over by more than ₱0.50 — a CLOSED receivable with
 *       |variance| > 0.50. The ₱0.50 tolerance lives ONLY here (M6 Data Health),
 *       never in a stored balance (§4 rule 17). Strictly greater than 0.50, so an
 *       exact ±0.50 does NOT fire (tolerance boundary).
 *   (d) referral fees owed out — a DEAL concern, not a receivable one: referral_out
 *       > 0 AND referral_paid = false (§ M4 explicitly-NOT / M6 reads M1's fields).
 *       Included here as the single M4/M6 data-health entry point; the receivable
 *       carries no referral data (§1 structure note).
 *   (e)/(f) missing Property Type / Developer from Settings — dropped per M6 PRD
 *       rule 17 (referential integrity replaced the sheet's silent fallbacks); not
 *       built (WORKBOOK register item 8).
 *
 * Each check returns the offending rows (enough to render M6's list) plus a count.
 * Archived receivables/deals are excluded — they are out of every open-balance view
 * (§4 rule 16).
 */

/** ₱0.50 tolerance for the Closed variance check (c). Comparisons only, never stored. */
export const VARIANCE_TOLERANCE = "0.50";

export type FullyPaidOpenRow = {
  id: string;
  deal_id: string;
  deal_code: string;
  client_name: string;
  balance: string | null;
};

export type ClosedVarianceRow = {
  id: string;
  deal_id: string;
  deal_code: string;
  client_name: string;
  variance: string | null;
};

export type ReferralOwedRow = {
  id: string;
  deal_code: string;
  client_name: string;
  referral_out: string;
  referral_paid: boolean;
};

export type ReceivableHealth = {
  /** (b) Open receivables fully paid or over-collected (balance ≤ 0). */
  fullyPaidNotClosed: FullyPaidOpenRow[];
  /** (c) Closed receivables short/over by more than ₱0.50. */
  closedVarianceOverTolerance: ClosedVarianceRow[];
  /** (d) Deals with a referral fee owed out (referral_out > 0, not yet paid). */
  referralFeesOwed: ReferralOwedRow[];
  counts: {
    fullyPaidNotClosed: number;
    closedVarianceOverTolerance: number;
    referralFeesOwed: number;
  };
};

/**
 * (b) Fully paid but not marked Closed — Open, non-archived, balance ≤ 0.
 * balance is signed (no clamp), so ≤ 0 catches both exact-paid and over-collected.
 */
export async function getFullyPaidNotClosed(): Promise<FullyPaidOpenRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receivable")
    .select("id,deal_id,deal_code,client_name,balance::text")
    .eq("status", "open")
    .is("archived_at", null)
    .lte("balance", 0)
    .order("balance", { ascending: true })
    .returns<FullyPaidOpenRow[]>();

  if (error) throw new Error(`Could not read fully-paid-but-open receivables: ${error.message}`);
  return data ?? [];
}

/**
 * (c) Closed receivables short/over by more than ₱0.50 — |variance| > 0.50. Two
 * range filters (variance > 0.50 OR variance < −0.50) express |x| > 0.50 without a
 * server-side abs(); the ±0.50 boundary itself is excluded (strictly greater).
 */
export async function getClosedVarianceOverTolerance(): Promise<ClosedVarianceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receivable")
    .select("id,deal_id,deal_code,client_name,variance::text")
    .eq("status", "closed")
    .is("archived_at", null)
    .or(`variance.gt.${VARIANCE_TOLERANCE},variance.lt.-${VARIANCE_TOLERANCE}`)
    .returns<ClosedVarianceRow[]>();

  if (error) throw new Error(`Could not read closed-variance receivables: ${error.message}`);
  return data ?? [];
}

/**
 * (d) Referral fees owed out — deals with referral_out > 0 AND referral_paid =
 * false. Read from the DEAL (M1's fields), not the receivable, which carries no
 * referral data. Non-archived only.
 */
export async function getReferralFeesOwed(): Promise<ReferralOwedRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal")
    .select("id,deal_code,client_name,referral_out::text,referral_paid")
    .eq("referral_paid", false)
    .gt("referral_out", 0)
    .is("archived_at", null)
    .order("referral_out", { ascending: false })
    .returns<ReferralOwedRow[]>();

  if (error) throw new Error(`Could not read referral fees owed: ${error.message}`);
  return data ?? [];
}

/** Assemble all three receivable-side data-health checks + their counts (M6 feed). */
export async function getReceivableHealth(): Promise<ReceivableHealth> {
  const [fullyPaidNotClosed, closedVarianceOverTolerance, referralFeesOwed] =
    await Promise.all([
      getFullyPaidNotClosed(),
      getClosedVarianceOverTolerance(),
      getReferralFeesOwed(),
    ]);

  return {
    fullyPaidNotClosed,
    closedVarianceOverTolerance,
    referralFeesOwed,
    counts: {
      fullyPaidNotClosed: fullyPaidNotClosed.length,
      closedVarianceOverTolerance: closedVarianceOverTolerance.length,
      referralFeesOwed: referralFeesOwed.length,
    },
  };
}
