import { isSplitAtSourceRisk, type DealComputeInput } from "@/lib/engine";

/**
 * The soft-warnings engine (FR-M1-11). Warnings are advisory — they never block
 * a save. The UI renders each as an amber "Continue anyway" banner, and a save
 * made while a warning is active is recorded as an audited override (§6, the
 * "Continue anyway (audit-logged)" contract).
 *
 * These predicates are PURE so they run identically in the live preview, in the
 * form's submit-time recheck and in a unit test. The one warning that needs a DB
 * read — the duplicate guard — is resolved server-side and passed in as a list,
 * so this function stays pure.
 */

export type DealWarningKey =
  | "duplicate"
  | "split_at_source"
  | "representation_mismatch";

export type DealWarning = {
  key: DealWarningKey;
  message: string;
};

/** A same-buyer/same-property/same-price deal within the 30-day window (rule 18). */
export type DuplicateMatch = {
  deal_code: string;
  booked_date: string;
};

const RENTAL_ROLES = new Set(["lessor", "lessee"]);
const SALE_ROLES = new Set(["seller", "buyer"]);

/**
 * Representation vs transaction coupling (§3.1 field 7, §4 rule 12 note:
 * "Lessor/Lessee only when Rental (warn otherwise)"). A soft warning, not a hard
 * error — a Sale with a rental-side role, or a Rental with a sale-side role, is
 * almost always a slip, but Double Ended and Referrer are legitimate on either.
 */
export function representationMismatch(
  input: Pick<DealComputeInput, "transaction_type" | "representation">
): string | null {
  if (input.transaction_type === "sale" && RENTAL_ROLES.has(input.representation)) {
    return "Lessor and Lessee are rental roles, but this is a Sale. Did you mean Seller, Buyer, or Double Ended?";
  }
  if (input.transaction_type === "rental" && SALE_ROLES.has(input.representation)) {
    return "Seller and Buyer are sale roles, but this is a Rental. Did you mean Lessor, Lessee, or Double Ended?";
  }
  return null;
}

/**
 * Assemble every soft warning that applies to a deal. Order is stable so the UI
 * and the audit log list them the same way every time.
 */
export function computeDealWarnings(
  input: DealComputeInput,
  duplicates: readonly DuplicateMatch[] = []
): DealWarning[] {
  const warnings: DealWarning[] = [];

  if (duplicates.length > 0) {
    const codes = duplicates.map((d) => d.deal_code).join(", ");
    warnings.push({
      key: "duplicate",
      message: `This looks like a possible duplicate of ${codes} — same client, property, and list price within 30 days. Same-buyer, same-day deals are legitimate; continue if this is a separate deal.`,
    });
  }

  if (isSplitAtSourceRisk(input)) {
    warnings.push({
      key: "split_at_source",
      message:
        "One-sided resale with a Referral Out. If the other side's cut is deducted at source, your Rate % should already be your net share — don't also record it as a Referral Out. Continue if you disburse this fee yourself.",
    });
  }

  const mismatch = representationMismatch(input);
  if (mismatch) {
    warnings.push({ key: "representation_mismatch", message: mismatch });
  }

  return warnings;
}
