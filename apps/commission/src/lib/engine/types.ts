/**
 * M1.1 — Calculation engine types.
 *
 * The engine is the ONLY code path that produces money figures (FR-M1-05). Its
 * contract is deliberately narrow and string-typed:
 *
 *  - every money amount and every rate ENTERS as an exact decimal string (the DB
 *    returns `numeric` as a string, and it must never become a binary float on
 *    the way here — Master PRD §4.3);
 *  - every computed money figure LEAVES as an exact decimal string rounded to
 *    centavos at the output boundary and nowhere earlier (see ROUNDING.md);
 *  - counts and enums may be plain values — only money/rates are string-bound.
 *
 * These types mirror the M0 domain enums as their lowercase tokens:
 *  property_vat_rule → 'threshold' | 'always_vat' | 'always_exempt'
 *  developer.comm_base → 'gross' | 'net'
 * so a persistence layer (M1.2) maps rows to this shape without translation.
 */

export type DealType = "developer" | "resale" | "n/a";
export type TransactionType = "sale" | "rental";
export type Representation =
  | "double_ended"
  | "seller"
  | "buyer"
  | "lessor"
  | "lessee"
  | "referrer";
export type PropertyVatRule = "threshold" | "always_vat" | "always_exempt";
export type CommBase = "gross" | "net";

/** Deal Log col Y — blank is stored as `null` and means Yes (M1 PRD §3.1 field 24). */
export type IncentiveTaxable = "yes" | "no";

/** Rule A output (col O). */
export type PropertyVat = "vat_able" | "exempt" | "n/a";

/**
 * Rule D output (col V). The enum is an invariant, never an option: a taxable
 * deal on a VAT-registered workspace is `inclusive`; everything else is `n/a`.
 * The workbook's `Exclusive` value was removed from the product (M1 PRD §11 OQ1,
 * resolved by removal) — it has NO code path here and can never be produced.
 */
export type VatBasis = "inclusive" | "n/a";

/** Rule C output (col T). `n/a` for any non-developer deal. */
export type CommBaseDisplay = CommBase | "n/a";

/**
 * Rule E input — the commission is quoted either as a rate on a base price
 * (`percent`) or as a flat billed figure (`fixed`). A discriminated union so the
 * mutually-exclusive fields cannot both be set and neither can be forgotten.
 *
 * `rate` is a decimal string, NOT a percentage: 5% is "0.05". Rentals carry the
 * exact fraction 1/12 rather than a truncated 0.0833 — pass it as the string
 * "1/12" and the engine divides exactly (M1 PRD §4 rule 17). "0.05" and "1/12"
 * are both accepted forms of the same decimal-rate contract.
 */
export type CommissionInput =
  | { basis: "percent"; rate: string }
  | { basis: "fixed"; amount: string };

/**
 * Everything the engine needs to book one deal — a faithful snapshot of the
 * deal's input fields plus the resolved references it depends on.
 *
 * `transaction_type` and `representation` are carried for completeness (they
 * feed the soft-warning predicates and M2 segmentation) even though the money
 * math never reads them; the arithmetic is a function of the fields below them.
 */
export type DealComputeInput = {
  deal_type: DealType;
  transaction_type: TransactionType;
  representation: Representation;

  /** Adjacent-property override (col N). Only meaningful on Developer deals. */
  force_vat: boolean;

  /** From the resolved PropertyType (M0 §3.4). Ignored for non-developer deals. */
  property_vat_rule: PropertyVatRule;

  /** Col M — the property price, or annual rent for a rental (M1 PRD §4 rule 7). */
  list_price: string;

  commission: CommissionInput;

  /** From the resolved Developer (M0 §3.5). `null` for non-developer deals. */
  developer_comm_base: CommBase | null;

  /** Col U. Developer deals are always treated Yes (M1 PRD §3.1 field 20). */
  receipt_issued: boolean;

  /** Col X — developer bonus, entered as billed. Default "0". */
  incentive_billed: string;

  /** Col Y — `null` (blank) means Yes (M1 PRD §3.1 field 24). */
  incentive_taxable: IncentiveTaxable | null;

  /** Col AA — 0 ≤ r < 1, decimal string. Default "0". */
  referral_out_pct: string;

  /** Col AB — flat referral-out, decimal string. Default "0". */
  referral_out_fixed: string;
};

/**
 * The workspace tax snapshot the engine reads (M0 §3.3 tax_settings).
 * Rates are exact decimal strings: vat 0.12 is "0.1200", ewt 10% is "0.1000".
 */
export type EngineSettings = {
  vat_rate: string;
  ewt_rate: string;
  property_vat_threshold: string;
  /**
   * false ⇒ commission-VAT machinery is off for every deal: no ÷(1+vat)
   * anywhere, vat_basis stays `n/a`, VAT memo is 0; EWT still applies on
   * EWT-subject deals (M1 PRD §3.2 Rule D registration gate).
   */
  vat_registered: boolean;
};

/**
 * Everything the engine computes for a deal (M1 PRD §3.2: fields 14, 15, 19, 21,
 * 22, 25, 28, 29, 31, 32, 33). Every money figure is a centavo-scale decimal
 * string; `yield_on_list` is a rate string. `booked_year`/`display_label` are
 * NOT engine outputs — they are trivial non-money derivations owned by M1.2.
 */
export type DealDerived = {
  /** Field 14 (col O) — Rule A. */
  property_vat: PropertyVat;
  /** Field 15 (col P) — Rule B. */
  net_list_price: string;
  /** Field 19 (col T) — Rule C. */
  comm_base: CommBaseDisplay;
  /** Field 21 (col V) — Rule D. */
  vat_basis: VatBasis;
  /** Rule E intermediate (billed commission) — shown in the computed panel (§6). */
  billed_commission: string;
  /** Field 22 (col W) — Rule E. */
  gci_net_of_vat: string;
  /** Field 25 (col Z) — Rule F. */
  incentive_net: string;
  /** Field 28 (col AC) — Rule G. */
  referral_out: string;
  /** Field 29 (col AD) — Rule H. */
  net_gci: string;
  /**
   * M4 Rule K.2 — the receivable's *default* Total Collectible (cash expected in):
   * `gci_net_of_vat + incentive_net`, computed at FULL precision and rounded once
   * (equivalently `net_gci + referral_out`). NOT a workbook Deal-Log column; it is
   * the deal-level anchor M4 mirrors onto the receivable so the cash-in figure ties
   * to the centavo (D013: 906,752.23, not 906,752.24 from summed 2-dp displays).
   * Computed here — the only place full-precision gci/incentive exist — so the
   * engine stays the single source of money truth (FR-M1-05).
   */
  default_total_collectible: string;
  /** Field 31 (col AF) — Rule I. */
  vat_memo: string;
  /** Field 32 (col AG) — Rule I. */
  ewt_memo: string;
  /** Field 33 (col AH) — Rule J, a rate string (0.044324 ⇒ 4.4324%). */
  yield_on_list: string;
  /**
   * Rule D taxability — whether the deal is EWT-subject. Not a workbook column;
   * carried so M4/M5 and the payment split can key off it without re-deriving.
   */
  taxable: boolean;
};

/** Payments Log type (col I). Blank is stored as commission (WORKBOOK §4). */
export type PaymentType = "commission" | "incentive";

/**
 * A payment against a deal, as the split needs to see it (M5 / WORKBOOK §4).
 * The split keys off the deal's stored `vat_basis` and whether the deal is
 * EWT-subject, so a payment logged years later reproduces the booking-time math.
 */
export type PaymentSplitInput = {
  /** Col H — gross commission as billed. */
  gross: string;
  /** The deal's stored VAT basis (M1 field 21). */
  vat_basis: VatBasis;
  payment_type: PaymentType;
  /** Only consulted for incentive payments; `null` (blank) means Yes. */
  incentive_taxable: IncentiveTaxable | null;
  /**
   * Whether the underlying deal is EWT-subject (developer or receipted resale/
   * rental — `DealDerived.taxable`). Drives EWT on a non-VAT workspace, where the
   * deal is EWT-subject yet its vat_basis is `n/a` (M5 Rule P5).
   */
  ewt_subject: boolean;
};

/** WORKBOOK §4 Payments Log computed columns K, L, M, N + dashboard Retained. */
export type PaymentSplit = {
  gross: string;
  /** K = net of VAT. */
  net_of_vat: string;
  /** L = output VAT. */
  vat: string;
  /** M = EWT withheld (creditable). */
  ewt: string;
  /** N = net cash to bank = gross − EWT. */
  net_cash: string;
  /** Retained = gross − VAT − EWT (dashboard-level; WORKBOOK §4). */
  retained: string;
};
