import type { PlanningBasis } from "./aggregate";

/**
 * M2.3 — the versioned PlanningBasis contract M3 consumes (PRD §3.4, FR-M2-03).
 *
 * This is the module's most important external surface: the two full-precision
 * numbers the whole GCI Calculator runs on, plus the monotonic version token M3
 * caches against. It is deliberately a PURE mapper (no `server-only`, no DB) so
 * that M3's unit tests, the consumer test double, and the precision CI proof can
 * all import it and exercise the exact shape the server hands over — see
 * `getPlanningBasis` in ./planning-basis for the server read path.
 *
 * WIRE SHAPE — snake_case + decimal STRINGS on purpose:
 *   - `all_time_yield` / `all_time_price` cross to M3 at FULL precision as decimal
 *     strings, NEVER JSON numbers. A JSON number is an IEEE-754 float, and the §3.4
 *     cross-check identity (yield × price = ₱381,676.31) only survives if the
 *     decimals are handed over unrounded and un-floated (Rule 7). `null` carries the
 *     "no sales deals" semantics — volume = 0 → yield null; deals = 0 → price null.
 *   - `all_time_sales_volume` / `all_time_sales_gci` are 2-dp decimal strings
 *     ("0.00" when there are no sales), the stored-value sums the numbers derive from.
 *   - `all_time_sales_deals` and `basis_version` are the only JSON numbers — integer
 *     counts, no precision to lose.
 *
 * VERSION SEMANTICS: `basis_version` is a per-workspace monotonic counter, bumped
 * whenever a Sales-segment (Resale/Developer) cell changes value (the DB owns this —
 * `consume_yield_events`). It starts at 0, meaning "no realized sales basis has ever
 * been established"; the first sales deal makes it ≥ 1. It is ALWAYS present (even for
 * an empty workspace) so M3 always has a stable cache key. `computed_at` is the stamp
 * of the last bump, `null` until the first one.
 */
export type PlanningBasisContract = {
  /** gci ÷ volume at full precision; null when there are no sales deals (volume = 0). */
  all_time_yield: string | null;
  /** volume ÷ deals at full precision; null when there are no sales deals (deals = 0). */
  all_time_price: string | null;
  /** Count of all-time non-archived sales (Resale + Developer) deals; 0 when none. */
  all_time_sales_deals: number;
  /** Σ list_price over those deals, 2 dp ("0.00" when none). */
  all_time_sales_volume: string;
  /** Σ net_gci over those deals, 2 dp ("0.00" when none). */
  all_time_sales_gci: string;
  /** Monotonic cache-coherence token; 0 before the first sales basis is established. */
  basis_version: number;
  /** ISO timestamp of the last basis change; null before the first. */
  computed_at: string | null;
};

/** The per-workspace version stamp (from yield_basis_version); null before the first bump. */
export type BasisVersionStamp = {
  basisVersion: number;
  computedAt: string;
} | null;

/**
 * Map the pure §3.4 PlanningBasis + the version stamp into the M3 wire contract.
 * Pure and total: a missing version row (a workspace whose sales basis was never
 * established) becomes `basis_version: 0` / `computed_at: null` — the version is
 * always present, so M3 never has to special-case its absence.
 */
export function toPlanningBasisContract(
  basis: PlanningBasis,
  version: BasisVersionStamp
): PlanningBasisContract {
  return {
    all_time_yield: basis.allTimeYield,
    all_time_price: basis.allTimePrice,
    all_time_sales_deals: basis.allTimeSalesDeals,
    all_time_sales_volume: basis.allTimeSalesVolume,
    all_time_sales_gci: basis.allTimeSalesGci,
    basis_version: version?.basisVersion ?? 0,
    computed_at: version?.computedAt ?? null,
  };
}
