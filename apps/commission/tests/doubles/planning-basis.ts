import type { PlanningBasisContract } from "@/lib/yield";

/**
 * M2.3 — the consumer test double for the PlanningBasis contract (PRD §3.4).
 *
 * M3's unit tests import these instead of standing up a database: a typed fake that
 * IS the exact wire shape `getPlanningBasis()` returns, so M3 can prove its
 * fees-per-deal / deals-needed math against a fixed, full-precision basis with no
 * Supabase, no drain, no clock.
 *
 * The canned values are pinned to reality by tests/unit/yield/planning-basis.test.ts,
 * which rebuilds them from the workbook fixtures through the real mapper and asserts
 * byte-equality — so this double can never silently drift from what the API emits.
 */

/**
 * The v30.20 workbook's realized basis — the canonical "has data" fixture.
 * Full-precision yield × price = ₱381,676.31 (the §3.4 identity / M3's Professional
 * Fees per deal). 17 sales deals · ₱159,280,945.00 volume · ₱6,488,497.25 GCI.
 * basis_version 1 (established on the workbook import).
 */
export const WORKBOOK_PLANNING_BASIS: PlanningBasisContract = {
  all_time_yield: "0.04073618002454719238387240859",
  all_time_price: "9369467.352941176470588235294",
  all_time_sales_deals: 17,
  all_time_sales_volume: "159280945.00",
  all_time_sales_gci: "6488497.25",
  basis_version: 1,
  computed_at: "2026-07-18T00:00:00.000Z",
};

/**
 * The same workbook with D021 archived (PRD criterion 8): 16 sales deals, blended
 * yield 4.0546%, all-time price ₱9,455,059.0625. basis_version bumped to 2 — the
 * "a deal moved, M3 must re-read" fixture.
 */
export const WORKBOOK_PLANNING_BASIS_D021_ARCHIVED: PlanningBasisContract = {
  all_time_yield: "0.04054645090959737196247683408",
  all_time_price: "9455059.0625",
  all_time_sales_deals: 16,
  all_time_sales_volume: "151280945.00",
  all_time_sales_gci: "6133905.41",
  basis_version: 2,
  computed_at: "2026-07-18T00:00:00.000Z",
};

/**
 * A brand-new workspace with zero sales deals (PRD criterion 11): nulls where a
 * division would be undefined, version PRESENT so M3 still has a stable cache key.
 * M3 renders its "no realized basis yet" state from this.
 */
export const EMPTY_PLANNING_BASIS: PlanningBasisContract = {
  all_time_yield: null,
  all_time_price: null,
  all_time_sales_deals: 0,
  all_time_sales_volume: "0.00",
  all_time_sales_gci: "0.00",
  basis_version: 0,
  computed_at: null,
};

/**
 * Build an arbitrary basis for a test — starts from the workbook basis and applies
 * overrides. Use for M3 edge cases ("what if yield is exactly X").
 */
export function makePlanningBasis(
  overrides: Partial<PlanningBasisContract> = {}
): PlanningBasisContract {
  return { ...WORKBOOK_PLANNING_BASIS, ...overrides };
}
