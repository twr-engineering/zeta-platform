import { toMoney } from "@/lib/money";
import type { Segment } from "./segments";
import {
  addTotals,
  assembleReport,
  fullPrecisionRatio,
  sumMoney,
  type PlanningBasis,
  type SegmentTotals,
  type SegmentTotalsBySegment,
  type YearFilter,
  type YieldSummaryReport,
} from "./aggregate";

/**
 * M2.2 — the pure reducer from materialized `yield_aggregate` cells back to the
 * report/planning-basis numbers. This is the bridge that makes the substrate
 * verifiable: `reportFromAggregates` and `planningBasisFromAggregates` recompute the
 * SAME shapes `buildYieldReport`/`buildPlanningBasis` produce over raw deals — through
 * the SAME assembler and ratio helpers (aggregate.ts) — so the reconciliation can
 * assert the materialized read model ties to the M2.1 pure functions to the centavo,
 * and M2.3's PlanningBasis API can read cells instead of scanning deals.
 *
 * A cell is one (segment, booked_year) row: deal_count + the four stored 2-dp sums.
 * Because each sum is already the per-(segment, year) total of stored 2-dp deal values
 * (Rule 8), adding cells stays exact 2-dp — the reduced numbers are byte-identical to
 * the pure functions' per-segment sums.
 */

/** One materialized row (money as the ::text strings YIELD_AGGREGATE_SELECT returns). */
export type YieldAggregateCell = {
  segment: Segment;
  booked_year: number;
  deal_count: number;
  volume_sum: string;
  gci_sum: string;
  incentive_net_sum: string;
  referral_out_sum: string;
};

/** Sum a set of cells (same segment, one or many years) into SegmentTotals. */
function totalsFromCells(cells: readonly YieldAggregateCell[]): SegmentTotals {
  return cells.reduce<SegmentTotals>(
    (acc, c) => ({
      deals: acc.deals + c.deal_count,
      volume: toMoney(acc.volume).plus(toMoney(c.volume_sum)).toFixed(2),
      gci: toMoney(acc.gci).plus(toMoney(c.gci_sum)).toFixed(2),
    }),
    { deals: 0, volume: "0.00", gci: "0.00" }
  );
}

/**
 * Rebuild the five-segment report (PRD §3.3) from materialized cells, for a year
 * filter. `unclassified` is passed [] — the aggregate excludes unclassified deals by
 * construction (Rule 9); their codes are surfaced by reconcile_yield_aggregate, not
 * the read model. Memos are the segment-agnostic whole-book sum over the scoped cells
 * (Rule 11) — this ties to the pure memo when the partition is clean (the fixtures;
 * an unclassified deal's incentive/referral is a data error, surfaced separately).
 */
export function reportFromAggregates(
  cells: readonly YieldAggregateCell[],
  yearFilter: YearFilter
): YieldSummaryReport {
  const scoped = cells.filter(
    (c) => yearFilter === "all" || c.booked_year === yearFilter
  );
  const bySeg = (seg: Segment) =>
    totalsFromCells(scoped.filter((c) => c.segment === seg));

  const totals: SegmentTotalsBySegment = {
    resale: bySeg("resale"),
    developer: bySeg("developer"),
    rental: bySeg("rental"),
    referral: bySeg("referral"),
  };

  return assembleReport(
    yearFilter,
    totals,
    sumMoney(scoped, (c) => c.incentive_net_sum),
    toMoney(sumMoney(scoped, (c) => c.referral_out_sum)).negated().toFixed(2),
    []
  );
}

/**
 * Rebuild the all-time planning basis (PRD §3.4) from materialized cells — over ALL
 * years' Resale + Developer cells, IGNORING any year filter (Rule 4). Full-precision
 * ratios (Rule 7 / the §3.4 identity), nulls when there are no sales deals. Mirrors
 * `buildPlanningBasis` exactly; `basis_version`/`computed_at` are added by M2.3 at the
 * API boundary from yield_basis_version.
 */
export function planningBasisFromAggregates(
  cells: readonly YieldAggregateCell[]
): PlanningBasis {
  const resale = totalsFromCells(cells.filter((c) => c.segment === "resale"));
  const developer = totalsFromCells(
    cells.filter((c) => c.segment === "developer")
  );
  const sales = addTotals(resale, developer);

  return {
    allTimeSalesDeals: sales.deals,
    allTimeSalesVolume: sales.volume,
    allTimeSalesGci: sales.gci,
    allTimeYield: fullPrecisionRatio(sales.gci, sales.volume),
    allTimePrice:
      sales.deals === 0
        ? null
        : toMoney(sales.volume).dividedBy(sales.deals).toString(),
  };
}
