import { toMoney } from "../money";
import type { DealComputeInput } from "./types";

/**
 * M1.1 — pure soft-warning predicates (edge case 16). The engine never blocks a
 * save; these expose the *conditions* the UI (FR-M1-11, M1.3) renders as amber
 * "Continue anyway" banners. Kept here so the money truth and the guardrails
 * that protect it live in one pure library.
 */

/**
 * Split-at-source risk (edge case 16 / §3.3 What-to-Book doctrine): a one-sided
 * resale (representation Seller or Buyer — a co-broke) that ALSO carries a
 * Referral Out. If the other side's cut is deducted at source, the agent's
 * Rate % should already be their net share, and the Referral Out would
 * double-count money that never touched their account. Split-at-source does not
 * occur in pre-selling, so the check is scoped to resale deals.
 */
export function isSplitAtSourceRisk(input: DealComputeInput): boolean {
  const oneSided =
    input.representation === "seller" || input.representation === "buyer";
  const hasReferralOut =
    toMoney(input.referral_out_pct).greaterThan(0) ||
    toMoney(input.referral_out_fixed).greaterThan(0);

  return input.deal_type === "resale" && oneSided && hasReferralOut;
}
