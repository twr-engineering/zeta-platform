import {
  Money,
  ZERO,
  toCentavoString,
  toMoney,
  type MoneyValue,
} from "@/lib/money";
import type {
  CommBaseDisplay,
  DealComputeInput,
  DealDerived,
  EngineSettings,
  PropertyVat,
  VatBasis,
} from "./types";

/**
 * M1.1 — the calculation engine (Rules A–J). Pure, deterministic, side-effect
 * free: no I/O, no database, no clock. Inputs and outputs are exact decimal
 * strings; all intermediate arithmetic carries full precision and rounds to
 * centavos ONLY at the output boundary (see ROUNDING.md).
 *
 * This is the single source of money truth. The UI never re-implements any of
 * it (FR-M1-05); the live computed panel and the payment split (payment-split.ts)
 * call back into this same library.
 *
 * The worked ₱ examples in each rule are reproduced to the centavo by the fixture
 * suite in tests/unit/engine.
 */

/**
 * Yield is a rate, not a money amount, so it is not centavo-rounded. It rounds
 * to 6 decimal places at the boundary — exactly the precision the 4-decimal
 * percentage display needs (0.044324 ⇒ 4.4324%). Downstream analytics (M2)
 * recompute yields from aggregated NET GCI ÷ volume and never read this string
 * for arithmetic.
 */
const YIELD_RATE_DP = 6;

/**
 * Billed commission for a `percent` deal: base × rate, exact.
 *
 * A rate may be a plain decimal ("0.05") or an exact fraction ("1/12"). For the
 * fraction form we multiply then divide — base × 1 ÷ 12 — so a one-month rental
 * on ₱270,000 annual rent is 22,500.00 to the centavo, not 22,499.9x from a
 * truncated 0.0833 (M1 PRD §4 rule 17). decimal.js division carries 28
 * significant digits, far beyond centavo precision, for every non-exact case.
 */
function billedFromRate(base: MoneyValue, rate: string): MoneyValue {
  const trimmed = rate.trim();
  if (trimmed.includes("/")) {
    const [numerator, denominator] = trimmed.split("/");
    return base.times(toMoney(numerator.trim())).dividedBy(toMoney(denominator.trim()));
  }
  return base.times(toMoney(trimmed));
}

/**
 * Rule A — Property VAT determination (developer sales only; RR 1-2024).
 * Non-developer deals are never developer sales → `n/a`. Threshold is strictly
 * greater-than: exactly at ₱3,600,000.00 the unit is exempt (edge case 1).
 * `force_vat` is the manual adjacent-property override (edge case 2).
 */
function propertyVat(input: DealComputeInput, threshold: MoneyValue): PropertyVat {
  if (input.deal_type !== "developer") return "n/a";
  if (input.force_vat) return "vat_able";
  if (input.property_vat_rule === "always_vat") return "vat_able";
  if (input.property_vat_rule === "always_exempt") return "exempt";
  // threshold rule
  return toMoney(input.list_price).greaterThan(threshold) ? "vat_able" : "exempt";
}

export function computeDeal(
  input: DealComputeInput,
  settings: EngineSettings
): DealDerived {
  const vatRate = toMoney(settings.vat_rate);
  const ewtRate = toMoney(settings.ewt_rate);
  const threshold = toMoney(settings.property_vat_threshold);
  const onePlusVat = new Money(1).plus(vatRate);

  const listPrice = toMoney(input.list_price);

  // Rule A — Property VAT (col O).
  const property_vat = propertyVat(input, threshold);

  // Rule B — Net List Price (col P): strip the property's 12% when VAT-able.
  // Full precision is kept for the commission base; the OUTPUT field rounds.
  const netListFull =
    property_vat === "vat_able" ? listPrice.dividedBy(onePlusVat) : listPrice;

  // Rule C — Commission base price. Developer.comm_base = Gross → gross TCP;
  // Net (or absent, which defaults to Net for developers, M0 §3.5) → net list.
  // Non-developer deals always base on list price.
  let basePrice: MoneyValue;
  let comm_base: CommBaseDisplay;
  if (input.deal_type === "developer") {
    comm_base = input.developer_comm_base ?? "net";
    basePrice = comm_base === "gross" ? listPrice : netListFull;
  } else {
    comm_base = "n/a";
    basePrice = listPrice;
  }

  // Rule D — Taxability + the registration gate. A deal is taxable (EWT-subject)
  // when it is a Developer deal or a receipted resale/rental. The VAT machinery
  // additionally requires a VAT-registered workspace.
  const taxable = input.deal_type === "developer" || input.receipt_issued;
  const vatInclusiveMode = taxable && settings.vat_registered;

  // Rule D (col V) — vat_basis is an invariant: inclusive on a taxable deal of a
  // VAT-registered workspace, `n/a` otherwise. `exclusive` is unreachable (OQ1).
  const vat_basis: VatBasis = vatInclusiveMode ? "inclusive" : "n/a";

  // Rule E — Billed commission and GCI (col W). Fixed ignores the base entirely
  // (edge case 3); VAT-inclusive income strips the 12% that is remitted, not
  // earned. On an untaxed deal or a non-VAT workspace, GCI = billed.
  const billed =
    input.commission.basis === "fixed"
      ? toMoney(input.commission.amount)
      : billedFromRate(basePrice, input.commission.rate);
  const gci = vatInclusiveMode ? billed.dividedBy(onePlusVat) : billed;

  // Rule F — Incentive (col Z). `No` carries as-is and is excluded from the memos
  // (edge case 7). `Yes`/blank follows the deal's receipt rules — ÷(1+vat) only
  // in VAT-inclusive mode, as-is otherwise.
  const incentiveBilled = toMoney(input.incentive_billed);
  const incentiveTaxable = input.incentive_taxable !== "no"; // blank/yes → true
  const incentiveNet =
    incentiveTaxable && vatInclusiveMode
      ? incentiveBilled.dividedBy(onePlusVat)
      : incentiveBilled;

  // Rule G — Referral Out (col AC): pct × billed commission + fixed. A fee the
  // agent disburses; tracked separately from NET GCI.
  const referralOut = toMoney(input.referral_out_pct)
    .times(billed)
    .plus(toMoney(input.referral_out_fixed));

  // Rule H — NET GCI (col AD): what the agent actually earns. Full precision
  // through the sum; a single centavo round at the boundary (ROUNDING.md).
  const netGci = gci.plus(incentiveNet).minus(referralOut);

  // Rule I — Tax memos (cols AF/AG). taxable_income = GCI + taxable incentive.
  // OQ2 (M1 PRD §11.2 / WORKBOOK DISCREPANCY 7): when a taxable deal carries a
  // referral-out the memo base could instead net it out (NET GCI). No live
  // fixture distinguishes them; Rule I as written excludes referral-out, and
  // this is the implemented DEFAULT — revisit if a taxable+referral-out row
  // ever appears. VAT memo is 0 on a non-VAT workspace; EWT still applies.
  const taxableIncome = incentiveTaxable ? gci.plus(incentiveNet) : gci;
  const vatMemo = vatInclusiveMode ? taxableIncome.times(vatRate) : ZERO;
  const ewtMemo = taxable ? taxableIncome.times(ewtRate) : ZERO;

  // Rule J — Yield on List (col AH). list_price > 0 is guaranteed upstream
  // (field 12 validation), so no divide-by-zero guard is reachable here.
  const yieldOnList = netGci
    .dividedBy(listPrice)
    .toDecimalPlaces(YIELD_RATE_DP, Money.ROUND_HALF_UP);

  return {
    property_vat,
    net_list_price: toCentavoString(netListFull),
    comm_base,
    vat_basis,
    billed_commission: toCentavoString(billed),
    gci_net_of_vat: toCentavoString(gci),
    incentive_net: toCentavoString(incentiveNet),
    referral_out: toCentavoString(referralOut),
    net_gci: toCentavoString(netGci),
    vat_memo: toCentavoString(vatMemo),
    ewt_memo: toCentavoString(ewtMemo),
    yield_on_list: yieldOnList.toFixed(YIELD_RATE_DP),
    taxable,
  };
}
