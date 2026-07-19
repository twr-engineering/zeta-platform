/**
 * M10.3 — the first-deal walkthrough's sample fixture (D021) + coach-mark script.
 *
 * PURE and money-free (M10 owns no financial logic). This module only names the
 * inputs the walkthrough OFFERS the agent to type into the REAL M1 deal form, and
 * the coach-mark copy that explains each computed-panel figure as it appears. Every
 * peso number quoted in the copy is a figure M1's engine PRODUCES from these
 * inputs (WORKBOOK_REFERENCE D021) — the walkthrough renders the engine's response,
 * it never computes anything (FR-M10-07).
 *
 * Fixture D021 (WORKBOOK_REFERENCE §3/§13): Sale · Developer · Abrown Inc. (Net) ·
 * House & Lot · List ₱8,000,000 · 5% Inclusive · incentive ₱40,000 taxable →
 * NET GCI ₱354,591.84.
 */

/**
 * The D021 inputs, keyed the way the M1 deal form's DealFormValues expects. The
 * three reference ids (developer / property type / lead source) are resolved at
 * runtime against the workspace's own lists (ensureSampleReferences), so they are
 * injected, not hard-coded here.
 */
export type SampleDealFixture = {
  bookedDate: string;
  transactionType: string;
  dealType: string;
  clientName: string;
  representation: string;
  propertyDetails: string;
  modeOfPayment: string;
  listPrice: string;
  commissionBasis: string;
  rate: string;
  incentiveBilled: string;
  incentiveTaxable: string;
  /** Names used to resolve/seed the reference ids the form needs (D021). */
  developerName: string;
  developerCommBase: "net" | "gross";
  propertyTypeName: string;
  leadSourceName: string;
};

export const D021_FIXTURE: SampleDealFixture = {
  bookedDate: "2026-07-10",
  transactionType: "sale",
  dealType: "developer",
  clientName: "Daria & John Salon",
  representation: "double_ended",
  propertyDetails: "Sample unit — House & Lot",
  modeOfPayment: "bank",
  listPrice: "8000000",
  commissionBasis: "percent",
  rate: "5",
  incentiveBilled: "40000",
  incentiveTaxable: "yes",
  developerName: "Abrown Inc.",
  developerCommBase: "net",
  propertyTypeName: "House & Lot",
  leadSourceName: "YouTube",
} as const;

/** The exact figures the engine returns for D021 — quoted verbatim in coach-marks. */
export const D021_FIGURES = {
  netList: "7,142,857.14",
  billed: "357,142.86",
  gci: "318,877.55",
  incentiveNet: "35,714.29",
  netGci: "354,591.84",
  vatMemo: "42,551.02",
  ewtMemo: "35,459.18",
  yield: "4.4324%",
} as const;

/** The optional sample release (Gross ₱50,000 Incentive) and its split. */
export const D021_SAMPLE_PAYMENT = {
  gross: "50000",
  paymentType: "incentive" as const,
  split: {
    netOfVat: "44,642.86",
    vat: "5,357.14",
    ewt: "4,464.29",
    netCash: "45,535.71",
    retained: "40,178.57",
  },
  /** The receivable balance after this release (D021: 354,591.84 − 44,642.86). */
  balanceAfter: "309,948.98",
} as const;

/**
 * A single coach-mark: it points at a form field or a computed-panel figure (by
 * its data-testid) and explains it. `anchor` is the element's data-testid; the
 * overlay resolves `[data-testid="…"]`. At ≤640px the overlay renders as a bottom
 * sheet (rule 13) rather than a floating popover.
 */
export type CoachMark = {
  id: string;
  anchor: string;
  title: string;
  body: string;
};

/**
 * The typed-along script (FR-M10-07). Ordered: first the inputs that drive the
 * money, then each computed figure as it settles — Net List, billed, GCI,
 * incentive net, NET GCI, the VAT/EWT memos, yield — finishing on Save.
 * PH-English; ₱ #,##0.00.
 */
export const D021_COACH_MARKS: readonly CoachMark[] = [
  {
    id: "list-price",
    anchor: "field-listPrice",
    title: "Start with the price",
    body: "List Price (TCP) is the full contract price — ₱8,000,000 for this sample. Everything else is computed from it.",
  },
  {
    id: "developer",
    anchor: "field-developerId",
    title: "The developer sets the base",
    body: "Abrown Inc. bills on the Net base, so your rate applies to the price net of VAT — ₱7,142,857.14, not the ₱8,000,000 gross. That is the Net List Price in the panel.",
  },
  {
    id: "rate",
    anchor: "field-rate",
    title: "Your rate",
    body: "5% of the net list is ₱357,142.86 billed — the commission the developer bills you, VAT still inside it.",
  },
  {
    id: "gci",
    anchor: "computed-gci",
    title: "GCI is net of VAT",
    body: "GCI = billed ÷ 1.12 = ₱318,877.55. The 12% output VAT is stripped out because it is remitted to the BIR, not earned.",
  },
  {
    id: "incentive",
    anchor: "field-incentiveBilled",
    title: "The incentive",
    body: "A taxable ₱40,000 incentive is booked net of VAT too: ₱40,000 ÷ 1.12 = ₱35,714.29 (the Incentive (net) row).",
  },
  {
    id: "net-gci",
    anchor: "computed-net-gci",
    title: "NET GCI — what you actually earn",
    body: "NET GCI = GCI + incentive (net) − referral out = ₱318,877.55 + ₱35,714.29 = ₱354,591.84. This is the headline figure the whole tool tracks.",
  },
  {
    id: "memos",
    anchor: "computed-vat-memo",
    title: "The tax memos",
    body: "VAT memo ₱42,551.02 is what you will remit; the EWT memo ₱35,459.18 (below it) is what the payor withholds and you claim back on Form 2307.",
  },
  {
    id: "yield",
    anchor: "computed-yield",
    title: "Yield on list",
    body: "Yield = NET GCI ÷ List Price = 4.4324%. It is how the planning tools compare deals of different sizes.",
  },
  {
    id: "save",
    anchor: "deal-submit",
    title: "Save your sample deal",
    body: "Save it. It lands on your books with a SAMPLE badge — everything you just learned appears exactly where your real deals will, and you can remove the sample in one click anytime.",
  },
] as const;
