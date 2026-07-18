import "server-only";

import { loadYieldAggregates, getYieldBasisVersion } from "./queries";
import { planningBasisFromAggregates } from "./materialized";
import { toPlanningBasisContract, type PlanningBasisContract } from "./contract";

/**
 * M2.3 — the PlanningBasis API for M3 (PRD §3.4, FR-M2-03). The server read path
 * behind the contract in ./contract: the single seam M3 imports to get the two
 * full-precision numbers the GCI Calculator runs on, with the version token it
 * caches against. `pnpm`-side callers use this directly (no HTTP hop); the thin
 * route at /api/yield/planning-basis wraps it for demo/debug and non-Next consumers.
 *
 * TENANT BOUNDARY — no `workspaceId` parameter, deliberately. Both reads below are
 * RLS-scoped to the caller's workspace exactly like every other M2 read
 * (loadYieldAggregates / getYieldBasisVersion, and the whole workspace/queries
 * pattern). Accepting a workspace id here would reintroduce the isolation footgun
 * settings/cache.ts warns about — an id from a request could serve another agent's
 * basis. RLS is the boundary; there is nothing to tamper with (AC9).
 *
 * WHY COMPUTE-ON-READ, NOT A CACHE (the §3.5/NFR "cached, invalidated by basis_version"
 * line — measured and decided per the brief):
 *   The read is two tiny indexed queries — the materialized cell rows (≤ segments ×
 *   years, a couple dozen at most even at 1,000 deals) and the single basis_version
 *   row. M6.1 faced the identical choice for the far heavier 8-section dashboard read,
 *   measured 22 ms server P95, and documented that a cache would "only add invalidation
 *   complexity for no benefit." This read is lighter, and here caching is not just
 *   unnecessary but actively WORSE for a versioned contract: basis_version must be read
 *   live (it IS the coherence token), so a cache over the cells could serve M3 a NEW
 *   version alongside OLD numbers if any invalidation seam were missed — the worst
 *   possible failure for a cache-coherence token (M3 would pin stale numbers under the
 *   fresh token and never refresh). Reading both live keeps the version and the numbers
 *   consistent by construction. The <50 ms P95 budget is met with room to spare
 *   (proven live in scripts/live-m23-check.mts). Reads run in PARALLEL, mirroring the
 *   dashboard's read pass.
 */
export async function getPlanningBasis(): Promise<PlanningBasisContract> {
  const [cells, version] = await Promise.all([
    loadYieldAggregates(),
    getYieldBasisVersion(),
  ]);
  return toPlanningBasisContract(planningBasisFromAggregates(cells), version);
}
