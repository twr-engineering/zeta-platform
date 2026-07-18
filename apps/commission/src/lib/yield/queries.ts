import "server-only";

import { createClient } from "@/lib/supabase/server";
import { YIELD_AGGREGATE_SELECT } from "@/lib/supabase/selects";
import type { YieldAggregateCell } from "./materialized";

/**
 * M2.2 — the server read/reconcile paths over the materialized yield read model.
 * All RLS-scoped to the caller's workspace (tenant isolation, FR-M2-11). M2.3 builds
 * the PlanningBasis API and M2.4 the report screen on top of `loadYieldAggregates` +
 * `getYieldBasisVersion`; `reconcileYieldAggregate` is the on-demand drift job
 * (FR-M2-10) — the server half of the reconciliation the verification script drives.
 */

/**
 * Load the workspace's materialized yield cells (money as ::text — never a float).
 * O(segments × years) rows; the report/planning reducers in materialized.ts turn
 * these into the §3.3/§3.4 numbers.
 */
export async function loadYieldAggregates(): Promise<YieldAggregateCell[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yield_aggregate")
    .select(YIELD_AGGREGATE_SELECT)
    .order("segment", { ascending: true })
    .order("booked_year", { ascending: true });
  if (error) {
    throw new Error(`Could not load yield aggregates: ${error.message}`);
  }
  return (data ?? []) as unknown as YieldAggregateCell[];
}

/** The per-workspace basis_version + last-computed stamp (null before the first drain). */
export type YieldBasisVersion = { basisVersion: number; computedAt: string };

export async function getYieldBasisVersion(): Promise<YieldBasisVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yield_basis_version")
    .select("basis_version,computed_at")
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load yield basis version: ${error.message}`);
  }
  if (!data) return null;
  const row = data as { basis_version: number; computed_at: string };
  return { basisVersion: Number(row.basis_version), computedAt: row.computed_at };
}

/** One drifting cell surfaced by the reconciliation (expected = raw, actual = stored). */
export type YieldDriftRow = {
  segment: string;
  booked_year: number;
  expected_count: number | null;
  actual_count: number | null;
  expected_volume: string | null;
  actual_volume: string | null;
  expected_gci: string | null;
  actual_gci: string | null;
  expected_incentive: string | null;
  actual_incentive: string | null;
  expected_referral: string | null;
  actual_referral: string | null;
};

/**
 * The reconciliation result (FR-M2-10). `ok` (zero drift) is the invariant; a
 * non-empty `drifts` is the alarm — the on-demand runner logs it loudly. `unclassified`
 * carries the Rule 9 data-quality signal (deals matching no segment).
 */
export type YieldReconciliation = {
  ok: boolean;
  driftCount: number;
  drifts: YieldDriftRow[];
  unclassified: string[];
  basisVersion: number;
};

/**
 * Run the on-demand reconciliation (FR-M2-10): the DB recomputes every cell from raw
 * deals and reports any drift vs the materialized rows. Read-only — a cursor reset +
 * re-drain is the repair. Nightly scheduling can call this same path.
 */
export async function reconcileYieldAggregate(): Promise<YieldReconciliation> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reconcile_yield_aggregate");
  if (error) {
    throw new Error(`Could not reconcile yield aggregates: ${error.message}`);
  }
  const r = data as unknown as {
    ok: boolean;
    drift_count: number;
    drifts: YieldDriftRow[];
    unclassified: string[];
    basis_version: number;
  };
  return {
    ok: r.ok,
    driftCount: r.drift_count,
    drifts: r.drifts ?? [],
    unclassified: r.unclassified ?? [],
    basisVersion: Number(r.basis_version ?? 0),
  };
}
