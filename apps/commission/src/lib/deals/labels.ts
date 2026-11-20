import type {
  DealCommBaseDisplay,
  DealCommissionBasis,
  DealIncentiveTaxable,
  DealModeOfPayment,
  DealPropertyVat,
  DealRepresentation,
  DealTransactionType,
  DealTypeEnum,
  DealVatBasis,
} from "@/types/entities";

/**
 * Human labels + captions for the deal enums (M1 §3.1, WORKBOOK §3).
 *
 * ONE place, shared by the form dropdowns, the list columns, the detail view and
 * the per-deal audit history — a label that drifts between the form and the log
 * is exactly how a spreadsheet's meaning gets lost in translation. The captions
 * are the Start Here doctrine copy (WORKBOOK §12), reproduced so the agent with
 * zero real-estate context can pick the right value (M1 PRD §6, audience note).
 */

export const TRANSACTION_TYPE_LABELS: Record<DealTransactionType, string> = {
  sale: "Sale",
  rental: "Rental",
};

export const DEAL_TYPE_LABELS: Record<DealTypeEnum, string> = {
  developer: "Developer",
  resale: "Resale",
  n_a: "N/A",
};

export const DEAL_TYPE_CAPTIONS: Record<DealTypeEnum, string> = {
  developer: "A unit sold for a property developer (pre-selling or ready-for-occupancy).",
  resale: "A secondary-market property.",
  n_a: "Used for rentals — a rental has no developer.",
};

export const REPRESENTATION_LABELS: Record<DealRepresentation, string> = {
  double_ended: "Double Ended",
  seller: "Seller",
  buyer: "Buyer",
  lessor: "Lessor",
  lessee: "Lessee",
  referrer: "Referrer",
};

/** Start Here definitions (WORKBOOK §12) — the agent chooses by meaning, not jargon. */
export const REPRESENTATION_CAPTIONS: Record<DealRepresentation, string> = {
  double_ended: "You represent BOTH sides — you earn the full commission.",
  seller: "You represent the seller only (e.g. a co-broke). Rate % is your net share.",
  buyer: "You represent the buyer only (e.g. a co-broke). Rate % is your net share.",
  lessor: "Rental: you represent the property owner (the lessor).",
  lessee: "Rental: you represent the tenant (the lessee).",
  referrer:
    "You introduced the parties only — this is a referral fee, reported on its own line.",
};

export const MODE_OF_PAYMENT_LABELS: Record<DealModeOfPayment, string> = {
  cash: "Cash",
  bank: "Bank",
  pagibig: "Pag-IBIG",
  deferred_cash: "Deferred Cash",
};

/**
 * Collection-timing meaning (WORKBOOK §12): pre-selling Cash is current (<1 yr);
 * Bank/Pag-IBIG/Deferred are long-term; resale/rental are all current.
 */
export const MODE_OF_PAYMENT_CAPTION =
  "How the buyer pays the developer — a collection-timing view. Pre-selling Cash is short-term (under a year); Bank, Pag-IBIG and Deferred Cash are long-term. Resale and rental are always current.";

export const COMMISSION_BASIS_LABELS: Record<DealCommissionBasis, string> = {
  percent: "% of base",
  fixed: "Fixed ₱",
};

/** Col Y — blank is stored as null and means Yes (§3.1 field 24). */
export const INCENTIVE_TAXABLE_LABELS: Record<DealIncentiveTaxable | "blank", string> = {
  blank: "Follows the deal (default)",
  yes: "Yes — taxable",
  no: "No — carried as-is, no VAT/EWT",
};

export const PROPERTY_VAT_LABELS: Record<DealPropertyVat, string> = {
  vat_able: "VAT-able",
  exempt: "Exempt",
  n_a: "N/A",
};

export const COMM_BASE_DISPLAY_LABELS: Record<DealCommBaseDisplay, string> = {
  gross: "Gross",
  net: "Net",
  n_a: "N/A",
};

export const VAT_BASIS_LABELS: Record<DealVatBasis, string> = {
  inclusive: "Inclusive",
  n_a: "N/A",
};

/** Field labels for the per-deal audit history and the global audit viewer. */
export const DEAL_FIELD_LABELS: Record<string, string> = {
  booked_date: "Booked date",
  transaction_type: "Transaction type",
  deal_type: "Deal type",
  developer_id: "Developer",
  client_name: "Client / counterparty",
  representation: "Representation",
  property_type_id: "Property type",
  lead_source_id: "Lead source",
  property_details: "Property details",
  mode_of_payment: "Mode of payment",
  list_price: "List price",
  force_vat: "Force VAT",
  commission_basis: "Commission basis",
  rate_pct: "Rate",
  fixed_amount: "Fixed amount",
  receipt_issued: "Receipt issued",
  incentive_billed: "Incentive (billed)",
  incentive_taxable: "Incentive taxable",
  referral_out_pct: "Referral out %",
  referral_out_fixed: "Referral out (fixed)",
  referral_paid: "Referral paid",
  property_vat: "Property VAT",
  net_list_price: "Net list price",
  comm_base: "Commission base",
  vat_basis: "VAT basis",
  billed_commission: "Billed commission",
  gci_net_of_vat: "GCI (net of VAT)",
  incentive_net: "Incentive (net)",
  referral_out: "Referral out",
  net_gci: "NET GCI",
  vat_memo: "VAT (memo)",
  ewt_memo: "EWT (memo)",
  yield_on_list: "Yield on list",
  archived_at: "Archived",
  warning_override: "Warning override",
};
