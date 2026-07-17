import { Money, ZERO, toCentavoString, toMoney } from "@/lib/money";
import type { EngineSettings, PaymentSplit, PaymentSplitInput } from "./types";

/**
 * M1.1 — payment split, co-located with the deal engine so there is ONE source
 * of money truth for M5 to reuse (WORKBOOK §4 Payments Log; M1 Milestones DoD).
 *
 * Split rules (verified against the workbook's 8 live payments):
 *   Inclusive        → K = H÷(1+vat); L = H−K; M = K×ewt; N = H−M.
 *   N/A (untaxed)    → K = H; L = 0; M = 0; N = H.
 *   Incentive + deal's Incentive Taxable? = No → L = M = 0 (edge case 7).
 *   Non-VAT workspace (M5 Rule P5): a deal is EWT-subject but its vat_basis is
 *     `n/a` → K = H; L = 0; M = H×ewt; N = H−M.
 *
 * Retained = H − L − M (dashboard-level concept; net of the VAT owed too).
 * Full precision throughout; a single centavo round per output field.
 */
export function computePaymentSplit(
  input: PaymentSplitInput,
  settings: EngineSettings
): PaymentSplit {
  const gross = toMoney(input.gross);
  const onePlusVat = new Money(1).plus(toMoney(settings.vat_rate));
  const ewtRate = toMoney(settings.ewt_rate);

  // A non-taxable incentive release carries no VAT and no EWT — it overrides
  // every other consideration (edge case 7 / edge case 10).
  const forceUntaxed =
    input.payment_type === "incentive" && input.incentive_taxable === "no";

  // VAT is stripped only when the deal was booked VAT-inclusive (which, by the
  // Rule D invariant, only happens on a VAT-registered workspace).
  const vatApplies = !forceUntaxed && input.vat_basis === "inclusive";

  // EWT applies on any inclusive deal AND on an EWT-subject deal whose basis is
  // `n/a` because the workspace is non-VAT (M5 Rule P5). It never applies to a
  // forced-untaxed incentive or a genuinely untaxed resale/rental.
  const ewtApplies = !forceUntaxed && (vatApplies || input.ewt_subject);

  const netOfVat = vatApplies ? gross.dividedBy(onePlusVat) : gross; // K
  const vat = vatApplies ? gross.minus(netOfVat) : ZERO; // L
  const ewt = ewtApplies ? netOfVat.times(ewtRate) : ZERO; // M
  const netCash = gross.minus(ewt); // N = H − M
  const retained = gross.minus(vat).minus(ewt); // H − L − M

  return {
    gross: toCentavoString(gross),
    net_of_vat: toCentavoString(netOfVat),
    vat: toCentavoString(vat),
    ewt: toCentavoString(ewt),
    net_cash: toCentavoString(netCash),
    retained: toCentavoString(retained),
  };
}
