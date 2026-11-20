import "server-only";

import {
  loadYieldAggregates,
  getYieldBasisVersion,
  loadUnclassifiedDealCodes,
} from "./queries";
import { reportFromAggregates, planningBasisFromAggregates } from "./materialized";
import type { PlanningBasis, YearFilter, YieldSummaryReport } from "./aggregate";

/**
 * M2.4 — the one server read the Yield Summary screen renders from. It reads the
 * SAME materialized substrate M2.3's PlanningBasis API reads (ZERO client math, ZERO
 * raw-deal scan for the numbers): `loadYieldAggregates` → the report + the all-time
 * planning basis, `getYieldBasisVersion` → the card's cache-coherence stamp, and
 * `loadUnclassifiedDealCodes` → the Rule 9 partition-invariant signal (FR-M2-08 runs the
 * invariant on every render; the heavier drift reconciliation stays the on-demand job,
 * FR-M2-10). All three reads are RLS-scoped to the caller's workspace and run in
 * parallel, mirroring the dashboard's read pass.
 *
 * The report is year-scoped; the planning basis is ALWAYS all-time (Rule 4) — the
 * card never flickers with the year filter. `yearsPresent` are the booked years the
 * data actually has (the filter's option list); `hasAnyData` distinguishes a truly
 * empty workspace (global empty state) from an empty *year* (zeros + the "basis
 * unaffected" hint).
 */
export type YieldSummaryView = {
  report: YieldSummaryReport;
  planningBasis: PlanningBasis;
  basisVersion: number;
  computedAt: string | null;
  /** Distinct booked years present in the aggregate, newest first. */
  yearsPresent: number[];
  /** Rule 9 — non-archived deals matching no segment (deal codes); [] when clean. */
  unclassified: string[];
  /** False only when the workspace has zero non-archived classified deals. */
  hasAnyData: boolean;
};

export async function getYieldSummaryView(
  yearFilter: YearFilter
): Promise<YieldSummaryView> {
  const [cells, version, unclassified] = await Promise.all([
    loadYieldAggregates(),
    getYieldBasisVersion(),
    loadUnclassifiedDealCodes(),
  ]);

  const yearsPresent = Array.from(new Set(cells.map((c) => c.booked_year))).sort(
    (a, b) => b - a
  );

  return {
    report: reportFromAggregates(cells, yearFilter),
    planningBasis: planningBasisFromAggregates(cells),
    basisVersion: version?.basisVersion ?? 0,
    computedAt: version?.computedAt ?? null,
    yearsPresent,
    unclassified,
    hasAnyData: cells.length > 0,
  };
}
