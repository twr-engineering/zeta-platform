import "server-only";

import { listReceivables } from "./queries";
import { allLeadSources } from "@/lib/settings/list-queries";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import {
  agingRows,
  bookingYearSummary,
  chaseProjection,
  perDeveloperRollups,
  perSourceRollups,
  positionTotals,
  searchProjection,
  type Aging,
  type BookingYearRow,
  type ChaseRow,
  type DeveloperRollup,
  type PositionTotals,
  type ReceivableSearchFilters,
  type ReceivableSearchRow,
  type SourceRollup,
} from "./projections";

/**
 * M4.4 projection endpoints (FR-M4-10/11/13) — the server-side reads M6/M7/M8/M9
 * consume. Each loads the RLS-scoped receivable rows ONCE via listReceivables (which
 * overlays live months_idle/age_months and joins the developer name) and hands them
 * to the pure aggregators in ./projections. No UI here — M6–M9 own the screens; this
 * is the typed data contract they read.
 *
 * Correctness over staleness (§8): these read straight through, so a projection is
 * never behind an M1/M5 event. Caching, if a screen needs it, layers on top and
 * invalidates on every deal/payment event — but the base read is always live.
 */

/** M6 §1 — position totals over every active receivable. */
export async function getPositionTotals(): Promise<PositionTotals> {
  return positionTotals(await listReceivables());
}

/** M6 §4 — aging of open balances, bucketed by live age_months. */
export async function getAgingRows(): Promise<Aging> {
  return agingRows(await listReceivables());
}

/** M6 §5 — per-developer rollups incl. the no-developer row and TOTAL. */
export async function getPerDeveloperRollups(): Promise<{
  rows: DeveloperRollup[];
  total: DeveloperRollup;
}> {
  return perDeveloperRollups(await listReceivables());
}

/**
 * M6 §8 — the ordered open-balance chase list with each row's follow-up state. The
 * ⚠-chase threshold is the workspace's chase_idle_months (tax settings); M4 supplies
 * the number, M6 owns the flag.
 */
export async function getChaseProjection(): Promise<ChaseRow[]> {
  const [rows, context] = await Promise.all([
    listReceivables(),
    getWorkspaceContext(),
  ]);
  const chaseIdleMonths = context?.taxSettings?.chase_idle_months ?? 3;
  return chaseProjection(rows, chaseIdleMonths);
}

/** M7 — per-lead-source rollups, optionally filtered to a booking year. */
export async function getPerSourceRollups(bookedYear?: number): Promise<{
  rows: SourceRollup[];
  total: Omit<SourceRollup, "leadSourceId" | "leadSourceName">;
}> {
  const [rows, sources] = await Promise.all([
    listReceivables(),
    allLeadSources(),
  ]);
  const names = new Map(sources.map((s) => [s.id, s.name]));
  return perSourceRollups(rows, names, bookedYear);
}

/** M8 Report 5 — booking-year summary rows. */
export async function getBookingYearSummary(): Promise<BookingYearRow[]> {
  return bookingYearSummary(await listReceivables());
}

/** M9 — the collectibles search projection (balance high→low). */
export async function getReceivableSearch(
  filters: ReceivableSearchFilters = {}
): Promise<ReceivableSearchRow[]> {
  return searchProjection(await listReceivables(), filters);
}
