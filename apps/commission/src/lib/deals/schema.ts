import { Money, parseAmountInput, percentToRate, toMoney } from "@/lib/money";
import type {
  DealCommissionBasis,
  DealIncentiveTaxable,
  DealModeOfPayment,
  DealRepresentation,
  DealTransactionType,
  DealTypeEnum,
} from "@/types/entities";

/**
 * Deal input validation (FR-M1-01, §4 rules 7, 12, 17).
 *
 * WHY THIS IS HAND-WRITTEN, NOT z.coerce — every money and rate field must stay
 * an EXACT decimal. z.coerce.number() would route the value through an IEEE-754
 * double (Master PRD §4.3), the exact float trap the whole product is built to
 * avoid. So amounts are parsed with the Decimal lib (@/lib/money) and carried as
 * strings; only the enum membership and the cross-field coupling are "schema"
 * work. The DB CHECK constraints are the backstop — this is the boundary that
 * turns a bad form into a sentence the agent can act on rather than a 23514.
 *
 * The conditional rules (§4 rule 12) are enforced here AND mirrored as CHECKs on
 * the table: developer deals need a developer, rentals are deal_type N/A, the
 * basis picks exactly one of rate / fixed.
 */

/** The validated, normalised deal — DB enum tokens, money as exact strings. */
export type DealInput = {
  booked_date: string;
  transaction_type: DealTransactionType;
  deal_type: DealTypeEnum;
  developer_id: string | null;
  client_name: string;
  representation: DealRepresentation;
  property_type_id: string;
  lead_source_id: string;
  property_details: string;
  mode_of_payment: DealModeOfPayment;
  list_price: string;
  force_vat: boolean;
  commission_basis: DealCommissionBasis;
  /** Engine form: a decimal ("0.05") or the exact fraction "1/12"; null on Fixed. */
  rate_pct: string | null;
  fixed_amount: string | null;
  receipt_issued: boolean;
  incentive_billed: string;
  incentive_taxable: DealIncentiveTaxable | null;
  referral_out_pct: string;
  referral_out_fixed: string;
  referral_paid: boolean;
};

export type ParseResult =
  | { ok: true; value: DealInput }
  | { ok: false; error: string };

/** The raw form as a flat record; FormData or a plain object both flatten to this. */
export type RawDeal = Record<string, string | null | undefined>;

const TRANSACTION_TYPES: readonly DealTransactionType[] = ["sale", "rental"];
const DEAL_TYPES: readonly DealTypeEnum[] = ["developer", "resale", "n_a"];
const REPRESENTATIONS: readonly DealRepresentation[] = [
  "double_ended", "seller", "buyer", "lessor", "lessee", "referrer",
];
const MODES: readonly DealModeOfPayment[] = ["cash", "bank", "pagibig", "deferred_cash"];
const BASES: readonly DealCommissionBasis[] = ["percent", "fixed"];

function str(raw: RawDeal, key: string): string {
  return (raw[key] ?? "").toString().trim();
}

/** Checkboxes arrive as "true"/"on"/"1" when ticked, absent/empty otherwise. */
function bool(raw: RawDeal, key: string): boolean {
  const v = str(raw, key).toLowerCase();
  return v === "true" || v === "on" || v === "1" || v === "yes";
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/** A required positive amount. */
function positiveAmount(raw: RawDeal, key: string, label: string):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const parsed = parseAmountInput(str(raw, key));
  if (parsed === null) return { ok: false, error: `Enter a valid ${label}.` };
  if (!parsed.greaterThan(0)) return { ok: false, error: `${label} must be greater than zero.` };
  return { ok: true, value: parsed.toFixed(2) };
}

/** An optional amount ≥ 0, defaulting to "0" when blank. */
function nonNegativeAmount(raw: RawDeal, key: string, label: string):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const text = str(raw, key);
  if (text === "") return { ok: true, value: "0" };
  const parsed = parseAmountInput(text);
  if (parsed === null) return { ok: false, error: `Enter a valid ${label}.` };
  if (parsed.lessThan(0)) return { ok: false, error: `${label} cannot be negative.` };
  return { ok: true, value: parsed.toFixed(2) };
}

/**
 * The rate (§4 rule 17). Two accepted forms:
 *   - a fraction "a/b" (the rentals' exact 1/12), kept verbatim for the engine;
 *   - a percentage number ("5", "8.333"), stored as the decimal 0.05 / 0.08333.
 * Both must land in 0 < r ≤ 1. The fraction stays a fraction so 270,000 × 1/12 is
 * 22,500.00 to the centavo, not 22,499.9x from a truncated 0.0833.
 */
function parseRate(text: string):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Enter the commission rate." };

  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    if (parts.length !== 2) return { ok: false, error: "Enter the rate as a percentage or a fraction like 1/12." };
    const [n, d] = parts.map((p) => p.trim());
    if (!/^\d+$/.test(n) || !/^\d+$/.test(d) || d === "0") {
      return { ok: false, error: "A fraction rate must look like 1/12." };
    }
    const value = toMoney(n).dividedBy(toMoney(d));
    if (!value.greaterThan(0) || value.greaterThan(1)) {
      return { ok: false, error: "The rate must be greater than 0% and at most 100%." };
    }
    return { ok: true, value: `${n}/${d}` };
  }

  const percent = parseAmountInput(trimmed);
  if (percent === null) return { ok: false, error: "Enter the rate as a percentage or a fraction like 1/12." };
  const rate = percentToRate(percent);
  if (!rate.greaterThan(0) || rate.greaterThan(1)) {
    return { ok: false, error: "The rate must be greater than 0% and at most 100%." };
  }
  // Trailing-zero-free exact decimal ("5" → "0.05", not "0.0500").
  return { ok: true, value: new Money(rate.toString()).toString() };
}

/** A referral-out percentage: 0 ≤ r < 1, default 0. */
function parseReferralPct(text: string):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  if (text.trim() === "") return { ok: true, value: "0" };
  const percent = parseAmountInput(text);
  if (percent === null) return { ok: false, error: "Enter a valid referral-out percentage." };
  const rate = percentToRate(percent);
  if (rate.lessThan(0) || rate.greaterThanOrEqualTo(1)) {
    return { ok: false, error: "Referral-out must be at least 0% and under 100%." };
  }
  return { ok: true, value: new Money(rate.toString()).toString() };
}

/**
 * Validate + normalise a raw deal form into a DealInput. First error wins so the
 * agent fixes one thing at a time; the DB CHECKs backstop anything that slips.
 */
export function parseDeal(raw: RawDeal): ParseResult {
  const booked_date = str(raw, "bookedDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booked_date)) {
    return fail("Choose the date the deal was booked.");
  }

  const transaction_type = str(raw, "transactionType") as DealTransactionType;
  if (!TRANSACTION_TYPES.includes(transaction_type)) {
    return fail("Choose whether this is a Sale or a Rental.");
  }

  const deal_type = str(raw, "dealType") as DealTypeEnum;
  if (!DEAL_TYPES.includes(deal_type)) return fail("Choose the deal type.");

  // Rule 12 — the transaction/deal-type coupling.
  if (transaction_type === "rental" && deal_type !== "n_a") {
    return fail("A rental's deal type must be N/A.");
  }
  if (transaction_type === "sale" && deal_type === "n_a") {
    return fail("A sale is either a Developer or a Resale deal, not N/A.");
  }

  const representation = str(raw, "representation") as DealRepresentation;
  if (!REPRESENTATIONS.includes(representation)) {
    return fail("Choose how you represented this deal.");
  }

  // Rule 12 — developer pairing.
  const developerRaw = str(raw, "developerId");
  let developer_id: string | null;
  if (deal_type === "developer") {
    if (developerRaw === "") return fail("Choose the developer for this developer deal.");
    developer_id = developerRaw;
  } else {
    if (developerRaw !== "") {
      return fail("Only developer deals carry a developer. Clear it, or change the deal type.");
    }
    developer_id = null;
  }

  const client_name = str(raw, "clientName");
  if (client_name === "") return fail("Enter the client or counterparty.");
  if (client_name.length > 160) return fail("The client name is too long.");

  const property_type_id = str(raw, "propertyTypeId");
  if (property_type_id === "") return fail("Choose a property type.");

  const lead_source_id = str(raw, "leadSourceId");
  if (lead_source_id === "") return fail("Choose a lead source.");

  const property_details = str(raw, "propertyDetails");
  if (property_details === "") return fail("Enter the property details.");
  if (property_details.length > 240) return fail("The property details are too long.");

  const mode_of_payment = str(raw, "modeOfPayment") as DealModeOfPayment;
  if (!MODES.includes(mode_of_payment)) return fail("Choose the mode of payment.");

  const listPrice = positiveAmount(raw, "listPrice", "list price");
  if (!listPrice.ok) return fail(listPrice.error);

  const commission_basis = str(raw, "commissionBasis") as DealCommissionBasis;
  if (!BASES.includes(commission_basis)) return fail("Choose a commission basis.");

  // Basis pairing (§3.1 fields 16–18).
  let rate_pct: string | null = null;
  let fixed_amount: string | null = null;
  if (commission_basis === "percent") {
    const rate = parseRate(str(raw, "rate"));
    if (!rate.ok) return fail(rate.error);
    rate_pct = rate.value;
  } else {
    const fixed = positiveAmount(raw, "fixedAmount", "fixed commission amount");
    if (!fixed.ok) return fail(fixed.error);
    fixed_amount = fixed.value;
  }

  // Developer deals are always receipted/taxable (§3.1 field 20); the DB coerces
  // it too, but normalising here keeps the value the agent sees honest.
  const receipt_issued = deal_type === "developer" ? true : bool(raw, "receiptIssued");

  const incentive = nonNegativeAmount(raw, "incentiveBilled", "incentive amount");
  if (!incentive.ok) return fail(incentive.error);

  const incentiveTaxableRaw = str(raw, "incentiveTaxable");
  let incentive_taxable: DealIncentiveTaxable | null;
  if (incentiveTaxableRaw === "" || incentiveTaxableRaw === "blank") {
    incentive_taxable = null; // blank = Yes (§3.1 field 24)
  } else if (incentiveTaxableRaw === "yes" || incentiveTaxableRaw === "no") {
    incentive_taxable = incentiveTaxableRaw;
  } else {
    return fail("Incentive taxable must be Yes, No, or left blank.");
  }

  const referralPct = parseReferralPct(str(raw, "referralOutPct"));
  if (!referralPct.ok) return fail(referralPct.error);

  const referralFixed = nonNegativeAmount(raw, "referralOutFixed", "referral-out amount");
  if (!referralFixed.ok) return fail(referralFixed.error);

  return {
    ok: true,
    value: {
      booked_date,
      transaction_type,
      deal_type,
      developer_id,
      client_name,
      representation,
      property_type_id,
      lead_source_id,
      property_details,
      mode_of_payment,
      list_price: listPrice.value,
      force_vat: deal_type === "developer" ? bool(raw, "forceVat") : false,
      commission_basis,
      rate_pct,
      fixed_amount,
      receipt_issued,
      incentive_billed: incentive.value,
      incentive_taxable,
      referral_out_pct: referralPct.value,
      referral_out_fixed: referralFixed.value,
      referral_paid: bool(raw, "referralPaid"),
    },
  };
}
