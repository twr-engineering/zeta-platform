"use server";

import type { DealDerived } from "@/lib/engine";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { computeDealWarnings, type DealWarning } from "./deal-warnings";
import { deriveDeal } from "./compute";
import { buildComputeInput } from "./map";
import { parseDeal, type RawDeal } from "./schema";
import { findPossibleDuplicates, resolveDealRefs } from "./queries";

/**
 * The live computed panel (FR-M1-06) and the soft-warnings feed (FR-M1-11).
 *
 * A SERVER ROUND-TRIP DELIBERATELY, not a re-implementation in the browser: the
 * panel calls the exact same engine, the same resolved references and the same
 * tax settings the save uses, so what the agent sees before saving is what gets
 * booked — to the centavo (AC 1). The form debounces this as inputs change.
 *
 * It is lenient about incomplete input: a half-filled form returns
 * `{ ok: false, reason: "incomplete" }` and the panel shows placeholders, rather
 * than surfacing a validation error for a field the agent has not reached yet.
 */

export type PreviewResult =
  | { ok: true; derived: DealDerived; warnings: DealWarning[] }
  | { ok: false; reason: "incomplete" | "error"; error: string };

export async function previewDeal(
  raw: RawDeal,
  excludeId?: string
): Promise<PreviewResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "error", error: "Supabase is not configured." };
  }

  const context = await getWorkspaceContext();
  if (!context?.taxSettings) {
    return {
      ok: false,
      reason: "error",
      error: "Set up your tax settings before logging a deal.",
    };
  }

  const parsed = parseDeal(raw);
  if (!parsed.ok) {
    return { ok: false, reason: "incomplete", error: parsed.error };
  }

  const refs = await resolveDealRefs(parsed.value);
  if (!refs.ok) return { ok: false, reason: "error", error: refs.error };

  const computeInput = buildComputeInput(parsed.value, refs.refs);
  const derived = deriveDeal(parsed.value, refs.refs, context.taxSettings);

  const duplicates = await findPossibleDuplicates(parsed.value, excludeId);
  const warnings = computeDealWarnings(computeInput, duplicates);

  return { ok: true, derived, warnings };
}
