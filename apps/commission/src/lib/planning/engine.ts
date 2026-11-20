import { roundCentavos, toMoney, type MoneyValue } from "@/lib/money";
import type { PlanningBasisContract } from "@/lib/yield";
import { effectiveCos, effectiveOpex, netIncomePct, roundUp10k } from "./economics";

/**
 * M3.1 — the planning engine (PRD Rules P1–P13). PURE: no I/O, no persistence, no
 * clock. `computePlan` turns a net-income target into the whole plan — economic
 * model, goal rows, both funnels, and the sales-pace figures — and NEVER throws on
 * user input: impossible inputs come back as typed issues (Rule 1, FR-M3-09/10).
 *
 * FULL-PRECISION CHAINING (Rule P7, §3.4). Every derived figure is computed from the
 * unrounded upstream value; a string output is rounded to its display precision ONLY
 * at the boundary. Chaining display-rounded intermediates drifts the funnels by
 * hundredths (44.33 ÷ 0.25 = 177.33 vs the correct full-precision 177.32) and is
 * forbidden — the fixture suite pins the full-precision results.
 *
 * NO ÷1.12 ANYWHERE (Rule P6). The yield is realized NET-of-VAT GCI ÷ volume (M1
 * already stripped the 12% output VAT); dividing again would double-strip and
 * understate fees per deal by 10.7% (₱381,676.31 → ₱340,782.42). The fees fixture
 * catches it.
 */

/** Weeks per working year: monthly ÷ 4 = yearly ÷ 48 (Rule P8 / OQ-4 default). */
export const WEEKS_PER_YEAR = 48;
/** Months per year (Rule P8). */
export const MONTHS_PER_YEAR = 12;

/** The seven global conversion rates (§3.2); each divided UPWARD through a funnel. */
export type FunnelRates = {
  listingToSold: string;
  listingAppointmentRate: string;
  sellerContactToAppt: string;
  sellerLeadToContact: string;
  buyerViewingToAtp: string;
  buyerContactToViewing: string;
  buyerLeadToContact: string;
};

/** The workbook's seeded rates (§3.2 defaults) — 25/70/30/20 seller, 30/70/10 buyer. */
export const DEFAULT_FUNNEL_RATES: FunnelRates = {
  listingToSold: "0.25",
  listingAppointmentRate: "0.70",
  sellerContactToAppt: "0.30",
  sellerLeadToContact: "0.20",
  buyerViewingToAtp: "0.30",
  buyerContactToViewing: "0.70",
  buyerLeadToContact: "0.10",
};

/** The per-year target row (§3.1). Nulls carry "use default / use all-time" state. */
export type PlanYearTargetInput = {
  year: number;
  /** Rule 9 — null → year not plannable (no plan, no M6 target). */
  netIncomeTarget: string | null;
  /** Blank/null → 0.22 default (Rule P1). */
  opexPct: string | null;
  /** Blank/null → 0.10 default (Rule P1). */
  cosPct: string | null;
  /** Rule P5 — null (or ≤ 0) → AllTimeYield from the planning basis. */
  yieldOverride: string | null;
  /** Rule P5 — null (or ≤ 0) → AllTimePrice from the planning basis. */
  avgPriceOverride: string | null;
};

/** The Rule P12 aggregate (M3.4's query); the engine only does the P13 subtraction. */
export type PlanYtdAggregate = {
  /** Σ list_price (Sale + Rental, ≠ Referrer, booked in the plan year) — 2-dp string. */
  ytdActualSales: string;
};

/** Why a year cannot be planned — a typed result, never an exception (Rule 1). */
export type PlanIssueCode =
  /** Rule 9 — the year has no Net Income Target set. */
  | "net_income_target_missing"
  /** Rule P2 / rule 1 — opex % + cos % ≥ 100%, so net income % ≤ 0. */
  | "net_income_pct_nonpositive"
  /** §3.2 — a conversion rate is outside (0, 1]. */
  | "rate_out_of_range"
  /** Rule 5 — no sales basis yet and the year has no manual yield/price override. */
  | "basis_unavailable";

export type PlanIssue = {
  code: PlanIssueCode;
  /** The offending input field, when one can be named (for inline UI errors). */
  field?: string;
  /** Developer-facing summary; M3.3 maps codes to final UI copy. */
  message: string;
};

/** A figure broken Yearly / Monthly / Weekly (Rule P8). Every string is 2-dp. */
export type GoalRow = {
  yearly: string;
  monthly: string;
  weekly: string;
};

export type EconomicModel = {
  /** The Net Income Target, echoed at 2 dp. */
  netIncomeTarget: string;
  /** Effective opex fraction used (the row value or the 0.22 default). */
  opexEff: string;
  /** Effective cos fraction used (the row value or the 0.10 default). */
  cosEff: string;
  /** True when opex fell back to the 0.22 default (OQ marker for the UI badge). */
  opexIsDefault: boolean;
  /** True when cos fell back to the 0.10 default. */
  cosIsDefault: boolean;
  /** 1 − opex − cos (Rule P2), exact decimal string, e.g. "0.68". */
  netIncomePct: string;
  /** NIT ÷ net income % (Rule P3), 2 dp — the pre-round-up figure the UI shows small. */
  gciRawTarget: string;
  /** ROUNDUP_10K(raw) (Rule P4), 2 dp — the working goal shown large. */
  workingGciGoal: string;
};

export type Assumptions = {
  /** price_eff at 2 dp for display; the engine chained fees from full precision. */
  priceEff: string;
  /** yield_eff as a FULL-precision rate string (Rule 7) — the UI formats to 4 dp. */
  yieldEff: string;
  /** Where price_eff came from (Rule P5 / FR-M3-05). */
  priceSource: "override" | "all_time";
  /** Where yield_eff came from. */
  yieldSource: "override" | "all_time";
  /** price_eff × yield_eff (Rule P6), 2 dp — the NET GCI per average deal. */
  feesPerDeal: string;
};

export type FunnelStage = {
  key: string;
  label: string;
  /** The rate applied to the stage BELOW to reach this one; null on the base stage. */
  rate: string | null;
  counts: GoalRow;
};

export type Funnel = {
  side: "seller" | "buyer";
  /** Ordered bottom → top (SOLD/ATP first, leads last); counts increase upward. */
  stages: FunnelStage[];
};

export type Pace = {
  /** price_eff × buyer_atp ≡ goal ÷ yield_eff (Rule P11), 2 dp. */
  totalSalesRequired: string;
  /** Booked volume for the plan year (Rule P12); null when no aggregate was supplied. */
  ytdActualSales: string | null;
  /** total − ytd (Rule P13), 2 dp; may be negative (target beaten); null with no ytd. */
  balanceToTarget: string | null;
};

export type Plan = {
  year: number;
  economicModel: EconomicModel;
  assumptions: Assumptions;
  /** Goal rows for the headline figures (Rule P8). */
  goals: {
    gci: GoalRow;
    netIncome: GoalRow;
    listingsSold: GoalRow;
    buyerAtp: GoalRow;
  };
  sellerFunnel: Funnel;
  buyerFunnel: Funnel;
  pace: Pace;
};

export type PlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; issues: PlanIssue[] };

// --- internals ---------------------------------------------------------------

/** A rate is valid iff 0 < r ≤ 1 (§3.2). Guards every funnel division upfront. */
function validateRates(rates: FunnelRates): PlanIssue[] {
  const entries: [keyof FunnelRates, string][] = [
    ["listingToSold", rates.listingToSold],
    ["listingAppointmentRate", rates.listingAppointmentRate],
    ["sellerContactToAppt", rates.sellerContactToAppt],
    ["sellerLeadToContact", rates.sellerLeadToContact],
    ["buyerViewingToAtp", rates.buyerViewingToAtp],
    ["buyerContactToViewing", rates.buyerContactToViewing],
    ["buyerLeadToContact", rates.buyerLeadToContact],
  ];
  const issues: PlanIssue[] = [];
  for (const [field, value] of entries) {
    const r = toMoney(value);
    if (r.lessThanOrEqualTo(0) || r.greaterThan(1)) {
      issues.push({
        code: "rate_out_of_range",
        field,
        message: `Conversion rate "${field}" must be greater than 0% and at most 100%.`,
      });
    }
  }
  return issues;
}

/** Rule P5 — an override wins only when set AND > 0; else the all-time basis value. */
function resolveAssumption(
  override: string | null,
  basisValue: string | null
): { value: MoneyValue; source: "override" | "all_time" } | null {
  if (override !== null) {
    const o = toMoney(override);
    if (o.greaterThan(0)) return { value: o, source: "override" };
  }
  if (basisValue !== null) {
    const b = toMoney(basisValue);
    if (b.greaterThan(0)) return { value: b, source: "all_time" };
  }
  return null;
}

/** yearly ÷ 12 and yearly ÷ 48 (Rule P8), each from the FULL-precision yearly value. */
function goalRow(yearlyFull: MoneyValue): GoalRow {
  return {
    yearly: roundCentavos(yearlyFull).toFixed(2),
    monthly: roundCentavos(yearlyFull.dividedBy(MONTHS_PER_YEAR)).toFixed(2),
    weekly: roundCentavos(yearlyFull.dividedBy(WEEKS_PER_YEAR)).toFixed(2),
  };
}

type FunnelStep = { key: string; label: string; rate: string };

/** Divide upward from `base` through each step at full precision (Rules P9/P10). */
function buildFunnel(
  side: "seller" | "buyer",
  base: { key: string; label: string; value: MoneyValue },
  steps: FunnelStep[]
): Funnel {
  const stages: FunnelStage[] = [
    { key: base.key, label: base.label, rate: null, counts: goalRow(base.value) },
  ];
  let current = base.value;
  for (const step of steps) {
    current = current.dividedBy(toMoney(step.rate));
    stages.push({
      key: step.key,
      label: step.label,
      rate: step.rate,
      counts: goalRow(current),
    });
  }
  return { side, stages };
}

// --- the engine --------------------------------------------------------------

/**
 * Compute the full plan for one year (Rules P1–P13), or the typed issues explaining
 * why it cannot be computed. `ytd` is M3.4's Rule P12 aggregate; omit it and the
 * pace balance is left null (the plan still renders total-sales-required).
 */
export function computePlan(
  target: PlanYearTargetInput,
  rates: FunnelRates,
  basis: PlanningBasisContract,
  ytd?: PlanYtdAggregate | null
): PlanResult {
  const issues: PlanIssue[] = [...validateRates(rates)];

  // Rule 9 — a year without a Net Income Target is not plannable.
  if (target.netIncomeTarget === null) {
    issues.push({
      code: "net_income_target_missing",
      field: "netIncomeTarget",
      message: "Set a Net Income Target to build this year's plan.",
    });
  }

  // Rule P1/P2 — effective assumptions and net income %.
  const opexEff = effectiveOpex(target.opexPct);
  const cosEff = effectiveCos(target.cosPct);
  const pct = netIncomePct(opexEff, cosEff);
  if (pct.lessThanOrEqualTo(0)) {
    issues.push({
      code: "net_income_pct_nonpositive",
      field: "opexPct",
      message: "Opex % + Cost of Sales % must total less than 100%.",
    });
  }

  // Rule P5 — resolve effective price and yield (override else all-time basis).
  const price = resolveAssumption(target.avgPriceOverride, basis.all_time_price);
  const yieldRes = resolveAssumption(target.yieldOverride, basis.all_time_yield);
  if (price === null) {
    issues.push({
      code: "basis_unavailable",
      field: "avgPriceOverride",
      message:
        "No closed sales yet — enter an average price for this year to plan with.",
    });
  }
  if (yieldRes === null) {
    issues.push({
      code: "basis_unavailable",
      field: "yieldOverride",
      message: "No closed sales yet — enter a yield for this year to plan with.",
    });
  }

  if (issues.length > 0 || target.netIncomeTarget === null || price === null || yieldRes === null) {
    return { ok: false, issues };
  }

  // --- all inputs valid: chain at full precision -----------------------------
  const nit = toMoney(target.netIncomeTarget);
  const rawFull = nit.dividedBy(pct); // Rule P3
  const workingGoal = toMoney(roundUp10k(rawFull)); // Rule P4 (exact ₱10,000 multiple)
  const feesFull = price.value.times(yieldRes.value); // Rule P6 — NO ÷1.12
  const dealsFull = workingGoal.dividedBy(feesFull); // Rule P7

  const economicModel: EconomicModel = {
    netIncomeTarget: roundCentavos(nit).toFixed(2),
    opexEff: opexEff.toString(),
    cosEff: cosEff.toString(),
    opexIsDefault: target.opexPct === null,
    cosIsDefault: target.cosPct === null,
    netIncomePct: pct.toString(),
    gciRawTarget: roundCentavos(rawFull).toFixed(2),
    workingGciGoal: workingGoal.toFixed(2),
  };

  const assumptions: Assumptions = {
    priceEff: roundCentavos(price.value).toFixed(2),
    yieldEff: yieldRes.value.toString(),
    priceSource: price.source,
    yieldSource: yieldRes.source,
    feesPerDeal: roundCentavos(feesFull).toFixed(2),
  };

  const sellerFunnel = buildFunnel(
    "seller",
    { key: "listings_sold", label: "Listings SOLD", value: dealsFull },
    [
      { key: "listings_to_take", label: "Listings to take", rate: rates.listingToSold },
      {
        key: "listing_appointments",
        label: "Listing Appointments",
        rate: rates.listingAppointmentRate,
      },
      { key: "seller_contacts", label: "Seller Contacts", rate: rates.sellerContactToAppt },
      { key: "seller_leads", label: "Seller Leads", rate: rates.sellerLeadToContact },
    ]
  );

  const buyerFunnel = buildFunnel(
    "buyer",
    { key: "buyer_atp", label: "Buyer ATP", value: dealsFull },
    [
      { key: "viewings", label: "Viewings", rate: rates.buyerViewingToAtp },
      { key: "buyer_contacts", label: "Buyer Contacts", rate: rates.buyerContactToViewing },
      { key: "buyer_leads", label: "Buyer Leads", rate: rates.buyerLeadToContact },
    ]
  );

  // Rule P11 — total sales required (price × ATP ≡ goal ÷ yield), full precision.
  const totalSalesFull = price.value.times(dealsFull);
  let ytdActualSales: string | null = null;
  let balanceToTarget: string | null = null;
  if (ytd) {
    const actual = toMoney(ytd.ytdActualSales);
    ytdActualSales = roundCentavos(actual).toFixed(2);
    balanceToTarget = roundCentavos(totalSalesFull.minus(actual)).toFixed(2); // Rule P13
  }

  const plan: Plan = {
    year: target.year,
    economicModel,
    assumptions,
    goals: {
      gci: goalRow(workingGoal),
      netIncome: goalRow(nit),
      listingsSold: goalRow(dealsFull),
      buyerAtp: goalRow(dealsFull),
    },
    sellerFunnel,
    buyerFunnel,
    pace: {
      totalSalesRequired: roundCentavos(totalSalesFull).toFixed(2),
      ytdActualSales,
      balanceToTarget,
    },
  };

  return { ok: true, plan };
}

// Re-export the shared economic-model surface so consumers can import the whole M3
// engine from one place (M6's feed re-exports deriveAnnualTarget via dashboard/target).
export {
  deriveAnnualTarget,
  DEFAULT_COS_PCT,
  DEFAULT_OPEX_PCT,
  effectiveCos,
  effectiveOpex,
  netIncomePct,
  roundUp10k,
  type TargetTableRow,
} from "./economics";
