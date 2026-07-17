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
  DeveloperCommBase,
  PropertyVatRule,
  ReceivableStatus,
  PaymentTypeEnum,
} from "@/types/entities";

/**
 * M1.4 workbook importer — the shapes that flow parse → build → reconcile →
 * payload. Every money value is an EXACT decimal STRING end to end (Master PRD
 * §4.3): the parser reads cells into strings, the engine (@/lib/engine) computes
 * from strings, and the payload hands strings to run_workbook_import, which casts
 * them to numeric only at the column boundary.
 */

// --- Settings (parsed from the Settings sheet) ------------------------------

export type ParsedTax = {
  vat_rate: string;
  ewt_rate: string;
  property_vat_threshold: string;
  chase_idle_months: number;
  /** The workbook implies a VAT-registered agent — every deal is VAT-inclusive. */
  vat_registered: boolean;
};

export type ParsedPropertyType = { name: string; vat_rule: PropertyVatRule };
export type ParsedDeveloper = { name: string; comm_base: DeveloperCommBase };
export type ParsedLeadSource = { name: string };

export type ParsedSettings = {
  tax: ParsedTax;
  property_types: ParsedPropertyType[];
  developers: ParsedDeveloper[];
  lead_sources: ParsedLeadSource[];
};

// --- Deal Log (parsed rows) -------------------------------------------------

/** The workbook's cached computed cells, for reconciliation. Absent when the
 * cell lost its cache (D001's ARRAYFORMULA-anchor row — §3 note). */
export type CachedDealFigures = {
  property_vat?: string;
  net_list_price?: string;
  gci_net_of_vat?: string;
  incentive_net?: string;
  referral_out?: string;
  net_gci?: string;
  vat_memo?: string;
  ewt_memo?: string;
  yield_on_list?: string;
};

export type ParsedDeal = {
  /** Source row number in the Deal Log, for error messages. */
  row: number;
  deal_code: string;
  booked_date: string; // ISO YYYY-MM-DD
  transaction_type: DealTransactionType;
  deal_type: DealTypeEnum;
  developer_name: string | null;
  client_name: string;
  representation: DealRepresentation;
  property_type_name: string;
  property_vat_rule: PropertyVatRule; // resolved from Settings
  lead_source_name: string;
  property_details: string;
  mode_of_payment: DealModeOfPayment;
  list_price: string;
  force_vat: boolean;
  commission_basis: DealCommissionBasis;
  /** Engine form: a decimal ("0.05") or the exact fraction "1/12" (rentals). */
  rate_pct: string | null;
  fixed_amount: string | null;
  developer_comm_base: DeveloperCommBase | null; // resolved from Settings
  receipt_issued: boolean;
  incentive_billed: string;
  incentive_taxable: DealIncentiveTaxable | null;
  referral_out_pct: string;
  referral_out_fixed: string;
  referral_paid: boolean;
  cached: CachedDealFigures;
};

// --- Payments Log (parsed rows) ---------------------------------------------

export type CachedPaymentSplit = {
  net_of_vat?: string;
  vat?: string;
  ewt?: string;
  net_cash?: string;
};

export type ParsedPayment = {
  row: number;
  deal_code: string;
  payment_date: string; // ISO
  gross_amount: string;
  payment_type: PaymentTypeEnum;
  reference_note: string | null;
  cached: CachedPaymentSplit;
};

// --- Collectibles (parsed overlay rows) -------------------------------------

export type ParsedOverlay = {
  row: number;
  deal_code: string;
  status: ReceivableStatus;
  /** The Confirmed Collectible override (col R), null when the cell is blank. */
  confirmed: string | null;
  note: string | null;
  /** Cached Total Collectible (col I) / Booked NET GCI (col H), for reconciliation. */
  cached_total_collectible?: string;
  cached_booked_net_gci?: string;
};

// --- The whole parsed workbook + the header mapping report ------------------

/** One column's header-text check (v30.13+ layout validation). */
export type HeaderCheck = {
  sheet: string;
  column: string;
  expected: string;
  found: string;
  ok: boolean;
};

export type RawWorkbook = {
  settings: ParsedSettings;
  deals: ParsedDeal[];
  payments: ParsedPayment[];
  overlays: ParsedOverlay[];
  headerChecks: HeaderCheck[];
};

// --- Reconciliation ---------------------------------------------------------

export type Mismatch = {
  scope: "deal" | "payment" | "overlay";
  code: string;
  field: string;
  expected: string; // engine-recomputed
  actual: string; // workbook cached
};

// --- The engine-computed payload sent to run_workbook_import ----------------

export type PayloadDealDerived = {
  property_vat: DealPropertyVat;
  net_list_price: string;
  comm_base: DealCommBaseDisplay;
  vat_basis: DealVatBasis;
  billed_commission: string;
  gci_net_of_vat: string;
  incentive_net: string;
  referral_out: string;
  net_gci: string;
  default_total_collectible: string;
  vat_memo: string;
  ewt_memo: string;
  yield_on_list: string;
  taxable: boolean;
};

export type PayloadDeal = {
  deal_code: string;
  booked_date: string;
  transaction_type: DealTransactionType;
  deal_type: DealTypeEnum;
  developer_name: string | null;
  client_name: string;
  representation: DealRepresentation;
  property_type_name: string;
  lead_source_name: string;
  property_details: string;
  mode_of_payment: DealModeOfPayment;
  list_price: string;
  force_vat: boolean;
  commission_basis: DealCommissionBasis;
  rate_pct: string | null;
  fixed_amount: string | null;
  receipt_issued: boolean;
  incentive_billed: string;
  incentive_taxable: DealIncentiveTaxable | null;
  referral_out_pct: string;
  referral_out_fixed: string;
  referral_paid: boolean;
  derived: PayloadDealDerived;
};

export type PayloadPaymentSplit = {
  net_of_vat: string;
  vat: string;
  ewt: string;
  net_cash: string;
  retained: string;
};

export type PayloadPayment = {
  deal_code: string;
  payment_date: string;
  gross_amount: string;
  payment_type: PaymentTypeEnum;
  reference_note: string | null;
  split: PayloadPaymentSplit;
  vat_basis_used: DealVatBasis;
  ewt_rate_used: string;
  vat_rate_used: string;
};

export type PayloadOverlay = {
  deal_code: string;
  status: ReceivableStatus;
  confirmed: string | null;
  note: string | null;
  legacy_note_missing: boolean;
};

/** The reconciled anchor totals — the Master PRD §9 acceptance figures. */
export type ImportAnchors = {
  /** Σ Total Collectible = ₱6,763,497.25 (to the centavo). */
  total_collectible: string;
  /** Σ booked NET GCI. */
  booked_net_gci: string;
  /** Σ payment Net-of-VAT (collected, net) = ₱1,908,192.86. */
  payment_net_collected: string;
  /**
   * Σ Outstanding balance = ₱4,855,304.39. A PENDING check M4.2 activates: it is
   * derived from payment aggregation (collected_net/balance), which M4.2 owns. The
   * importer reports it as the expected figure but does not assert it on the
   * receivable yet (that column stays at its M4.1 zero default until M4.2).
   */
  outstanding_pending: string;
};

export type ImportPayload = {
  file_hash: string;
  file_name: string | null;
  tax: ParsedTax;
  property_types: ParsedPropertyType[];
  developers: ParsedDeveloper[];
  lead_sources: ParsedLeadSource[];
  deals: PayloadDeal[];
  overlays: PayloadOverlay[];
  payments: PayloadPayment[];
  anchors: ImportAnchors;
};

// --- The plan the summary UI renders ----------------------------------------

export type ImportSummaryCounts = {
  deals: number;
  payments: number;
  overlays: number;
  property_types: number;
  developers: number;
  lead_sources: number;
  closed_statuses: number;
  next_deal_code: string;
};

export type ImportPlan = {
  payload: ImportPayload;
  counts: ImportSummaryCounts;
  anchors: ImportAnchors;
  mismatches: Mismatch[];
  headerChecks: HeaderCheck[];
  /** Non-blocking notices (pre-booking payment dates — silent per OQ5). */
  notices: string[];
};
