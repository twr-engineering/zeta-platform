import type { ReceivableStatus } from "@/types/entities";
import type { PaymentInput } from "./schema";

/**
 * The payment warning contract (§4 rules 3, 7, 8, 9; FR-M5-04). These are AMBER,
 * NON-BLOCKING signals — a "possible duplicate", a future or pre-booking date, a
 * Closed/Cancelled receivable — surfaced to the caller so the UI (M5.2) can show
 * a banner with an explicit "Continue anyway" (audit-logged). The save NEVER
 * blocks on a warning; the importer accepts them silently (historical fact, OQ5).
 *
 * PURE by construction so it is unit-testable and identical on the server and (in
 * M5.2) the preview: `today` is passed in (the caller computes it in Asia/Manila,
 * never from UTC — rule 20), as are the duplicate matches and the receivable
 * status. Dates compare as ISO strings, which is calendar-correct for YYYY-MM-DD.
 */

export type PaymentWarningKey =
  | "future_date"
  | "pre_booking_date"
  | "possible_duplicate"
  | "receivable_closed"
  | "receivable_cancelled";

export type PaymentWarning = {
  key: PaymentWarningKey;
  message: string;
};

/** An existing payment that matches (same deal + gross + date) — rule 3. */
export type DuplicatePaymentMatch = {
  payment_date: string;
  gross_amount: string;
};

export type PaymentWarningContext = {
  input: PaymentInput;
  /** The referenced deal's booking date (rule 9). */
  bookedDate: string;
  /** Today as an Asia/Manila civil date (rule 20). */
  today: string;
  /** The deal's receivable status, if known (rule 7). */
  receivableStatus?: ReceivableStatus | null;
  /** Same deal + gross + date matches already logged (rule 3). */
  duplicates?: readonly DuplicatePaymentMatch[];
};

/**
 * Assemble the applicable warnings for a payment. Order is stable (date issues,
 * then duplicate, then receivable status) so the UI renders them predictably.
 */
export function computePaymentWarnings(
  ctx: PaymentWarningContext
): PaymentWarning[] {
  const warnings: PaymentWarning[] = [];
  const { input, bookedDate, today } = ctx;

  // Rule 8 — future date. Post-dated releases are real; the warning catches typos.
  if (input.payment_date > today) {
    warnings.push({
      key: "future_date",
      message: "This payment is dated in the future. Post-dated releases are fine — check the date is right.",
    });
  }

  // Rule 9 — payment before the deal's booking date (D021's live release is one).
  // Warn only; never block (a block would reject real historical data at import).
  if (input.payment_date < bookedDate) {
    warnings.push({
      key: "pre_booking_date",
      message: `This payment is dated before the deal was booked (${bookedDate}). That happens — advice can precede the paperwork.`,
    });
  }

  // Rule 3 — soft duplicate guard. Legitimate identical tranches exist, so this
  // is never a hard block.
  if (ctx.duplicates && ctx.duplicates.length > 0) {
    warnings.push({
      key: "possible_duplicate",
      message: "A payment with the same deal, gross and date is already logged. Continue if this is a separate release.",
    });
  }

  // Rule 7 — logging against a Closed/Cancelled receivable. Late releases happen;
  // the warning names the status and (in M5.2) offers "Reopen receivable".
  if (ctx.receivableStatus === "closed") {
    warnings.push({
      key: "receivable_closed",
      message: "This deal's receivable is Closed. Logging will over-collect it — reopen the receivable to resume balance tracking, or continue anyway.",
    });
  } else if (ctx.receivableStatus === "cancelled") {
    warnings.push({
      key: "receivable_cancelled",
      message: "This deal's receivable is Cancelled. Reopen it to resume balance tracking, or continue anyway.",
    });
  }

  return warnings;
}
