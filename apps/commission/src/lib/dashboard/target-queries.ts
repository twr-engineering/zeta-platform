import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ANNUAL_TARGET_OVERRIDE_SELECT } from "@/lib/supabase/selects";
import type { AnnualTargetOverride } from "@/types/entities";
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
 * M3 TARGETTABLE SEAM (M6_Milestones "manual-override-only first"). M3's Targets
 * module lands AFTER M6 in the build order, so its per-year TargetTable does not
 * exist yet (grep: no target table anywhere in the schema, confirmed at M6.1). Until
 * M3.2, the derived annual target is unavailable and this returns null — Section 2
 * shows "—" for a year with no override, exactly per §4 rule 9 (no error). The whole
 * derivation math (deriveAnnualTarget in ./target) is already correct and unit-
 * pinned against the v30.20 goal (16,920,000 from NIT 11.5M / 22% / 10%); M3.2's
 * ONLY change is to make this function return that real row for the year.
 *
 * See [[m6_1Handoff]]. When M3.2 lands, replace the body with a read of M3's
 * TargetTable (year, net_income_target, opex_pct, cos_pct) mapped to TargetTableRow.
 */
export async function getTargetTableRow(
  year: number
): Promise<TargetTableRow | null> {
  void year; // M3.2 will read the TargetTable row for `year`; until then there is none.
  return null;
}
