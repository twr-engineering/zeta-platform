import type {
  PaymentSplit,
  PaymentSplitInput,
  VatBasis as EngineVatBasis,
} from "@/lib/engine";
import type { Deal, DealVatBasis, TaxSettings } from "@/types/entities";
import type { PaymentInput } from "./schema";

/**
 * The bridge between the DB's enum tokens and M1.1's engine tokens for the
 * payment split — the mirror of src/lib/deals/map.ts on the payment side.
 *
 * The split keys off the deal's stored `vat_basis` and whether the deal is
 * EWT-subject (`taxable`), so a payment logged years later reproduces the
 * booking-time math (§3.2). Only `n_a` differs between the two token forms.
 */

/** DB deal_vat_basis → engine VatBasis (only 'n_a' differs). */
export function dbVatBasisToEngine(v: DealVatBasis): EngineVatBasis {
  return v === "n_a" ? "n/a" : v;
}

/**
 * Assemble the engine's PaymentSplitInput from a validated payment + the deal it
 * references. The deal supplies the tax context (vat_basis, incentive_taxable,
 * EWT-subject); the payment supplies the gross and the type. Nothing is trusted
 * from the client — the deal row is read server-side (queries.resolvePaymentDeal).
 */
export function buildPaymentSplitInput(
  input: PaymentInput,
  deal: Deal
): PaymentSplitInput {
  return {
    gross: input.gross_amount,
    vat_basis: dbVatBasisToEngine(deal.vat_basis),
    payment_type: input.payment_type,
    incentive_taxable: deal.incentive_taxable,
    // §3.2 / Rule P5 — the deal's EWT-subject flag drives EWT on a non-VAT
    // workspace, where vat_basis is `n/a` yet EWT still applies.
    ewt_subject: deal.taxable,
  };
}

/**
 * The full save-time snapshot: the engine's five ₱ fields plus the three `*_used`
 * audit anchors (§3.1 fields 11–13). `vat_basis_used` is the deal's basis as the
 * DB token (the column is deal_vat_basis, so no bridge back); the rates are the
 * workspace's current values. Captured together so the stored split is
 * independently re-derivable (rule 17, NFR auditability).
 */
export type PaymentSnapshot = {
  split: PaymentSplit;
  vat_basis_used: DealVatBasis;
  ewt_rate_used: string;
  vat_rate_used: string;
};

/**
 * The RPC argument object for create_payment: the validated inputs plus the
 * engine-computed snapshot, money as exact strings and enums as DB tokens.
 */
export function createPaymentRpcArgs(input: PaymentInput, snap: PaymentSnapshot) {
  return {
    p_deal_id: input.deal_id,
    p_payment_date: input.payment_date,
    p_gross_amount: input.gross_amount,
    p_payment_type: input.payment_type,
    p_reference_note: input.reference_note,
    // engine-computed split snapshot
    p_net_of_vat: snap.split.net_of_vat,
    p_vat_amount: snap.split.vat,
    p_ewt_amount: snap.split.ewt,
    p_net_cash: snap.split.net_cash,
    p_retained_cash: snap.split.retained,
    // *_used audit anchors
    p_vat_basis_used: snap.vat_basis_used,
    p_ewt_rate_used: snap.ewt_rate_used,
    p_vat_rate_used: snap.vat_rate_used,
  };
}

/** update_payment adds p_id / p_expected_version on top of the create args. */
export function updatePaymentRpcArgs(
  id: string,
  expectedVersion: number,
  input: PaymentInput,
  snap: PaymentSnapshot
) {
  return {
    p_id: id,
    p_expected_version: expectedVersion,
    ...createPaymentRpcArgs(input, snap),
  };
}

/** tax_settings row → the `*_used` rate anchors stored on the payment row. */
export function usedRates(tax: TaxSettings): Pick<
  PaymentSnapshot,
  "ewt_rate_used" | "vat_rate_used"
> {
  return { ewt_rate_used: tax.ewt_rate, vat_rate_used: tax.vat_rate };
}
