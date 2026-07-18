import "server-only";

import { listReceivables } from "@/lib/receivables/queries";
import { allLeadSources } from "@/lib/settings/list-queries";
import {
  distinctBookedYears,
  sourcePerformance,
  type SourcePerformanceReport,
} from "./build";

/**
 * M7 Source Performance server reads. Each loads the RLS-scoped rows ONCE and hands
 * them to the pure aggregator in ./build. No `workspace_id` filter and no
 * `workspaceId` param anywhere: RLS is the tenant boundary (M0 rule 1), the same
 * discipline as every query file — accepting a workspace id would be the isolation
 * footgun the settings/cache doctrine warns about (AC9 tenant isolation).
 *
 * The report reads live (compute-on-read, like M6.1's dashboard): a projection is
 * never behind an M1 deal / M5 payment / M4 status event; M7.3 layers cache +
 * invalidation on top per §4 rule 12 if the screen needs it.
 */

/**
 * FR-M7-01 — the Source Performance report for a booking year (or "all"). Reads the
 * active receivables (listReceivables) joined implicitly to their deal fields, plus
 * the M0 lead-source master list (active + archived, so the visibility/"(inactive)"
 * rules and never-orphan guarantee hold).
 */
export async function getSourcePerformance(
  year: number | "all" = "all"
): Promise<SourcePerformanceReport> {
  const [receivables, sources] = await Promise.all([
    listReceivables(),
    allLeadSources(),
  ]);
  return sourcePerformance(receivables, sources, year);
}

/**
 * FR-M7-02 — the distinct booked years for the year filter (newest first, only years
 * with ≥1 booked deal). The M7.2 dropdown offers `All` plus exactly these.
 */
export async function getSourcePerformanceYears(): Promise<number[]> {
  return distinctBookedYears(await listReceivables());
}
