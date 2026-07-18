import { toMoney, ZERO, type MoneyValue } from "@/lib/money";
import {
  classifySegment,
  unclassifiedDealCodes,
  type Segment,
  type YieldDeal,
} from "./segments";

/**
 * M2.1 — the pure aggregation core: `buildYieldReport` (PRD §3.3) and
 * `buildPlanningBasis` (§3.4), over an already-loaded array of deals. Mirrors
 * src/lib/dashboard/sections.ts exactly — no database, no `today`, no formatting —
 * so every number is unit-testable against the v30.20 fixture to the centavo, and
 * M2.2's materialized aggregate + reconciliation can recompute from these same
 * functions and assert zero drift.
 *
 * MONEY DISCIPLINE (Rule 8 + Rule 7). Volume/GCI/memos are FULL-precision sums of
 * the STORED 2-dp per-deal values, rounded to centavos once — so screen totals tie
 * to the deal list a user can export (the documented ₱0.01 memo-incentives
 * consequence: stored-sum ₱357,142.87 vs full-precision ₱357,142.86, PRD Rule 8).
 * Realized-yield and share ratios display at 6-dp rate precision (the engine's
 * `yield_on_list` convention — exactly the precision a 4-dp percent needs). The
 * planning-basis ratios cross to M3 at FULL precision and are NEVER display-rounded
 * (Rule 7): rounding the yield to 4 dp first throws the M3 fees-per-deal identity
 * off by ₱1.69.
 */

// --- year filter -------------------------------------------------------------

/** A booked year, or `All` (drops the year predicate). */
export type YearFilter = number | "all";

// --- money/ratio helpers (same discipline as dashboard/sections.ts) ----------

/** Full-precision sum of a money accessor over rows, rounded to centavos once. */
function sumMoney<T>(rows: readonly T[], get: (row: T) => string): string {
  return rows
    .reduce<MoneyValue>((acc, row) => acc.plus(toMoney(get(row))), ZERO)
    .toFixed(2);
}

/** a ÷ b as a 6-dp rate string (display precision), or null when b = 0 ("—"). */
function displayRatio(a: string, b: string): string | null {
  const denom = toMoney(b);
  if (denom.isZero()) return null;
  return toMoney(a).dividedBy(denom).toFixed(6);
}

/**
 * a ÷ b at FULL decimal precision (28 sig figs), or null when b = 0. Used ONLY for
 * the planning basis M3 consumes — NEVER display-rounded (Rule 7 / §3.4 identity).
 */
function fullPrecisionRatio(a: string, b: string): string | null {
  const denom = toMoney(b);
  if (denom.isZero()) return null;
  return toMoney(a).dividedBy(denom).toString();
}

// --- per-segment sub-totals --------------------------------------------------

/** deals / volume / gci for one bucket of deals (stored-value sums, Rule 8). */
type SegmentTotals = { deals: number; volume: string; gci: string };

function totalsOf(deals: readonly YieldDeal[]): SegmentTotals {
  return {
    deals: deals.length,
    volume: sumMoney(deals, (d) => d.list_price),
    gci: sumMoney(deals, (d) => d.net_gci),
  };
}

function addTotals(a: SegmentTotals, b: SegmentTotals): SegmentTotals {
  return {
    deals: a.deals + b.deals,
    volume: toMoney(a.volume).plus(toMoney(b.volume)).toFixed(2),
    gci: toMoney(a.gci).plus(toMoney(b.gci)).toFixed(2),
  };
}

// --- report shape ------------------------------------------------------------

/** The five fixed report rows, including the derived SALES SUBTOTAL. */
export type ReportRowKey =
  | "resale"
  | "developer"
  | "sales_subtotal"
  | "rental"
  | "referral";

export type SegmentRow = {
  key: ReportRowKey;
  deals: number;
  /** Σ list_price, centavos (2 dp). */
  volume: string;
  /** Σ net_gci, centavos (2 dp). */
  gci: string;
  /** gci ÷ volume, 6-dp rate; null ("—") when volume = 0. */
  realizedYield: string | null;
  /**
   * volume ÷ SALES-SUBTOTAL volume, 6-dp rate. Resale/Developer/Subtotal only;
   * ALWAYS null for Rental and Referral (the literal "—", PRD Rule 12); also null
   * when sales volume = 0.
   */
  shareOfSales: string | null;
};

export type YieldSummaryReport = {
  yearFilter: YearFilter;
  /** Fixed order: Resale, Developer, SALES SUBTOTAL, Rental, Referral (PRD §6). */
  rows: SegmentRow[];
  /** gci(Sales) + gci(Rental) + gci(Referral), centavos (2 dp). */
  totalGciAllOps: string;
  /** Σ incentive_net over ALL deals in Y, segment-agnostic (PRD §3.3), 2 dp. */
  memoIncentives: string;
  /** −Σ referral_out over ALL deals in Y — signed (e.g. "-75000.00"), 2 dp. */
  memoReferralOuts: string;
  /** volume(Resale) ÷ deals(Resale), 2 dp; null ("—") when 0 deals. */
  resaleAvgPrice: string | null;
  /** volume(Developer) ÷ deals(Developer), 2 dp; null when 0 deals. */
  developerAvgPrice: string | null;
  /** volume(Sales) ÷ deals(Sales), 2 dp; null when 0 sales deals. */
  blendedAvgPrice: string | null;
  /** gci(Rental) for the filter year, 2 dp. */
  rentalAnnualGci: string;
  /** Rule 9 — non-archived deals matching no segment (deal codes); [] when clean. */
  unclassified: string[];
};

/** avg price = volume ÷ deals as a 2-dp string, or null when deals = 0 ("—"). */
function avgPrice(totals: SegmentTotals): string | null {
  if (totals.deals === 0) return null;
  return toMoney(totals.volume).dividedBy(totals.deals).toFixed(2);
}

/**
 * Build the five-segment Yield Summary report for a year filter (PRD §3.3).
 *
 * `yearFilter = "all"` drops the year predicate; a number keeps only that booked
 * year. Archived deals are excluded first (PRD Rule 10). Every empty population
 * renders as zeros / null em-dashes — never a division error (PRD Rule 5).
 */
export function buildYieldReport(
  deals: readonly YieldDeal[],
  yearFilter: YearFilter
): YieldSummaryReport {
  const active = deals.filter((d) => d.archived_at === null);
  const inYear = active.filter(
    (d) => yearFilter === "all" || d.booked_year === yearFilter
  );

  const bySegment = (seg: Segment) =>
    inYear.filter((d) => classifySegment(d) === seg);

  const resaleDeals = bySegment("resale");
  const developerDeals = bySegment("developer");
  const rentalDeals = bySegment("rental");
  const referralDeals = bySegment("referral");

  const resale = totalsOf(resaleDeals);
  const developer = totalsOf(developerDeals);
  const sales = addTotals(resale, developer);
  const rental = totalsOf(rentalDeals);
  const referral = totalsOf(referralDeals);

  // Share of sales is volume-based, against the SALES SUBTOTAL volume (Rule 12).
  const share = (t: SegmentTotals) => displayRatio(t.volume, sales.volume);

  const row = (
    key: ReportRowKey,
    t: SegmentTotals,
    shareOfSales: string | null
  ): SegmentRow => ({
    key,
    deals: t.deals,
    volume: t.volume,
    gci: t.gci,
    realizedYield: displayRatio(t.gci, t.volume),
    shareOfSales,
  });

  const rows: SegmentRow[] = [
    row("resale", resale, share(resale)),
    row("developer", developer, share(developer)),
    row("sales_subtotal", sales, share(sales)),
    // Rental & Referral: Share of Sales is ALWAYS "—" (null), they are not sales.
    row("rental", rental, null),
    row("referral", referral, null),
  ];

  return {
    yearFilter,
    rows,
    totalGciAllOps: toMoney(sales.gci)
      .plus(toMoney(rental.gci))
      .plus(toMoney(referral.gci))
      .toFixed(2),
    // Memos are segment-agnostic — the whole-column SUM, year-filtered only (Rule 11).
    memoIncentives: sumMoney(inYear, (d) => d.incentive_net),
    memoReferralOuts: toMoney(sumMoney(inYear, (d) => d.referral_out))
      .negated()
      .toFixed(2),
    resaleAvgPrice: avgPrice(resale),
    developerAvgPrice: avgPrice(developer),
    blendedAvgPrice: avgPrice(sales),
    rentalAnnualGci: rental.gci,
    unclassified: unclassifiedDealCodes(active),
  };
}

// --- planning basis (the M3 feed) --------------------------------------------

/**
 * The all-time realized sales basis M3 consumes (PRD §3.4). Full-precision
 * decimals; nulls when there are no sales deals. `basis_version`/`computed_at`
 * are added by M2.2/M2.3 at the persistence/API boundary — the pure function
 * owns only the numbers.
 */
export type PlanningBasis = {
  allTimeSalesDeals: number;
  /** Σ list_price over ALL non-archived sales deals, 2 dp. */
  allTimeSalesVolume: string;
  /** Σ net_gci over ALL non-archived sales deals, 2 dp. */
  allTimeSalesGci: string;
  /** gci ÷ volume at FULL precision; null when volume = 0 (PRD §3.4, Rule 7). */
  allTimeYield: string | null;
  /** volume ÷ deals at FULL precision; null when deals = 0. */
  allTimePrice: string | null;
};

/**
 * Build the planning basis over ALL non-archived sales (Resale + Developer) deals,
 * IGNORING any year filter entirely (PRD §3.4 / Rule 4 — M3's live feed never
 * flickers with the report year).
 *
 * The two ratios cross to M3 at full precision so the §3.4 cross-check identity
 * holds to the centavo: allTimeYield × allTimePrice = gci ÷ deals = ₱381,676.31
 * (M3's verified Professional Fees per deal). Display-rounding the yield first
 * would give ₱381,674.62 — ₱1.69 off (Rule 7).
 */
export function buildPlanningBasis(deals: readonly YieldDeal[]): PlanningBasis {
  const salesDeals = deals.filter((d) => {
    if (d.archived_at !== null) return false;
    const seg = classifySegment(d);
    return seg === "resale" || seg === "developer";
  });

  const totals = totalsOf(salesDeals);

  return {
    allTimeSalesDeals: totals.deals,
    allTimeSalesVolume: totals.volume,
    allTimeSalesGci: totals.gci,
    allTimeYield: fullPrecisionRatio(totals.gci, totals.volume),
    allTimePrice:
      totals.deals === 0
        ? null
        : toMoney(totals.volume).dividedBy(totals.deals).toString(),
  };
}
