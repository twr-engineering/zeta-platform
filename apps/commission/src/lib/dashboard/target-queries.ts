import "server-only";

import { unstable_cache } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ANNUAL_TARGET_OVERRIDE_SELECT,
  PLAN_YEAR_TARGET_SELECT,
} from "@/lib/supabase/selects";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { planYearTargetToTargetTableRow } from "@/lib/planning";
import type { AnnualTargetOverride, PlanYearTarget } from "@/types/entities";
import type { TargetTableRow } from "./target";

/**
 * The two target INPUTS Section 2 derives from — read RLS-scoped, no workspace_id
 * filter (M0 rule 1). Kept separate from ./queries so the override CRUD actions and
 * the dashboard composer share one loader.
 */

/**
 * The AnnualTargetOverride row for a year (§3.1), or null when none is set. Money
 * (`amount`) arrives as a ::text string (never a float).
 */
export async function getAnnualTargetOverride(
  year: number
): Promise<AnnualTargetOverride | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("annual_target_override")
    .select(ANNUAL_TARGET_OVERRIDE_SELECT)
    .eq("year", year)
    .maybeSingle<AnnualTargetOverride>();

  if (error) throw new Error(`Could not read your annual target override: ${error.message}`);
  return data ?? null;
}

/**
 * M3.2 — the cache tag for a workspace's planning targets. Every PlanYearTarget
 * write (upsert/delete/import) invalidates it so Section 2's derived target reflects
 * the change on the next dashboard read (§8: "cacheable with invalidation on any
 * PlanYearTarget write"). One tag per workspace — invalidating one agent's targets
 * must never touch another's.
 */
export function planningTargetsTag(workspaceId: string): string {
  return `planning-targets:${workspaceId}`;
}

/**
 * THE M6 TARGETTABLE FEED (FR-M3-11 / M3.2). For a plan year, the three inputs Rule
 * P3+P4 needs — NIT + opex/cos — as a TargetTableRow, or null when the year has no
 * PlanYearTarget row OR its NIT is unset (rule 9, not plannable). M6's getAnnualTarget
 * layers the manual override on top, and deriveAnnualTarget turns this row into the
 * working GCI goal (16,920,000 for the 2026 workbook target) — the SAME code the
 * calculator runs, so M6 never re-implements the formula (m6_1Handoff seam resolved).
 *
 * CACHED per (workspace, year), invalidated by planningTargetsTag on any target write
 * (§8). TENANT ISOLATION UNDER A CACHE (see @/lib/settings/cache): a cache HIT does
 * NOT consult RLS, so `workspaceId` — which comes ONLY from the authenticated
 * getWorkspaceContext, never user input — is the isolation boundary. The Supabase
 * client is built OUTSIDE the cached closure (cookies() is unusable inside one, and a
 * MISS then still reads through RLS with the caller's own token).
 */
export async function getTargetTableRow(
  year: number
): Promise<TargetTableRow | null> {
  const context = await getWorkspaceContext();
  if (!context) return null;
  const workspaceId = context.workspace.id;

  const supabase = await createClient();

  const load = unstable_cache(
    async (): Promise<TargetTableRow | null> => {
      const { data, error } = await supabase
        .from("plan_year_target")
        .select(PLAN_YEAR_TARGET_SELECT)
        .eq("year", year)
        .maybeSingle<PlanYearTarget>();

      // Never cache a transient failure as "no target": a blip would blank Section 2
      // for the revalidate window. Throw so the caller decides.
      if (error) {
        throw new Error(`Could not read the planning target: ${error.message}`);
      }

      return data ? planYearTargetToTargetTableRow(data) : null;
    },
    ["planning-target-row", workspaceId, String(year)],
    {
      tags: [planningTargetsTag(workspaceId)],
      // Backstop only. Correctness comes from invalidatePlanningTargets() on write.
      revalidate: 300,
    }
  );

  return load();
}
