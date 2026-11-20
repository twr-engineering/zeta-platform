import { parseAmountInput } from "@/lib/money";
import type { PaymentType } from "@/lib/engine";

/**
 * Payment input validation (FR-M5-01, §4 rules 4, 14).
 *
 * Hand-written for the same reason as the deal schema: every money field must
 * stay an EXACT decimal (Master PRD §4.3), so `gross_amount` is parsed with the
 * Decimal lib and carried as a string, never routed through an IEEE-754 double.
 * Only enum membership, the positivity rule, and note length are "schema" work;
 * the DB CHECK constraints (payment_gross_positive, …) are the backstop.
 *
 * The split is NOT validated here — it is computed downstream by M1's engine
 * (computePaymentSplit) from the referenced deal + settings, never trusted from
 * the form (§3.2, there is no UI re-implementation of the math).
 */

/** The validated, normalised payment — DB enum tokens, money as an exact string. */
export type PaymentInput = {
  deal_id: string;
  /** Calendar date, YYYY-MM-DD (no timezone; rule 20). */
  payment_date: string;
  gross_amount: string;
  payment_type: PaymentType;
  /** OR / Invoice / free note; null when blank. */
  reference_note: string | null;
};

export type PaymentParseResult =
  | { ok: true; value: PaymentInput }
  | { ok: false; error: string };

/** The raw form as a flat record; FormData or a plain object both flatten to this. */
export type RawPayment = Record<string, string | null | undefined>;

const PAYMENT_TYPES: readonly PaymentType[] = ["commission", "incentive"];

function str(raw: RawPayment, key: string): string {
  return (raw[key] ?? "").toString().trim();
}

function fail(error: string): PaymentParseResult {
  return { ok: false, error };
}

/**
 * Validate + normalise a raw payment form into a PaymentInput. First error wins.
 *
 * Blank Type ≡ Commission (rule 14, WORKBOOK register item 9): the sheet's live
 * rows store explicit "Commission" too, and the importer maps blank → commission;
 * the SaaS always stores an explicit value, so a blank field defaults here.
 */
export function parsePayment(raw: RawPayment): PaymentParseResult {
  const deal_id = str(raw, "dealId");
  if (deal_id === "") return fail("Choose the deal this payment is against.");

  const payment_date = str(raw, "paymentDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
    return fail("Choose the date the payment was released.");
  }

  // Rule 4 / AC10: gross must be > 0 (zero and negative rejected; refunds are OQ2).
  const parsedGross = parseAmountInput(str(raw, "grossAmount"));
  if (parsedGross === null) return fail("Enter the gross commission amount.");
  if (!parsedGross.greaterThan(0)) {
    return fail("The gross commission must be greater than zero.");
  }

  // Blank ≡ Commission (rule 14).
  const typeRaw = str(raw, "paymentType").toLowerCase();
  let payment_type: PaymentType;
  if (typeRaw === "" || typeRaw === "commission") {
    payment_type = "commission";
  } else if (typeRaw === "incentive") {
    payment_type = "incentive";
  } else {
    return fail("Payment type must be Commission or Incentive.");
  }
  void PAYMENT_TYPES; // the closed set the two branches above enumerate

  const noteRaw = str(raw, "referenceNote");
  if (noteRaw.length > 240) {
    return fail("The OR / invoice note is too long — keep it under 240 characters.");
  }

  return {
    ok: true,
    value: {
      deal_id,
      payment_date,
      gross_amount: parsedGross.toFixed(2),
      payment_type,
      reference_note: noteRaw === "" ? null : noteRaw,
    },
  };
}
