"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { parseAmountInput, formatPHP } from "@/lib/money";
import { checkConfirmation } from "@/lib/friction/gate";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * M6 §3.1 / FR-M6-03 — the AnnualTargetOverride mutations (the module's SECOND write
 * path; Next Action is the first, in M4). Setting/changing/clearing the manual
 * annual GCI target is a money-planning act, so each is FRICTION-GATED (M0 §3.2 —
 * mode 'checked', OQ3 default) and the DB function is the single writer + audit
 * (old→new). Same shape as every mutation since M0.2: authenticate → gate → let ONE
 * database function do the change + its audit entry in a single transaction. Tenant
 * isolation is RLS (the RPC resolves the workspace via app.current_workspace_id()).
 */

type OverrideResult = {
  ok: boolean;
  changed?: boolean;
  reason?: "invalid_year" | "invalid_amount" | "note_too_long";
  year?: number;
  amount?: string;
  note?: string | null;
};

function notConfigured(): ActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

async function guard(): Promise<ActionState | null> {
  if (!isSupabaseConfigured()) return notConfigured();
  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };
  return null;
}

/** The dashboard reads the override live; revalidate it + the audit log. */
function revalidateDashboard(): void {
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.settingsAuditLog);
}

/** Parse the paid/dashboard year off the form. */
function readYear(formData: FormData): number | null {
  const y = Number(formData.get("year"));
  return Number.isInteger(y) ? y : null;
}

/**
 * Set or change the AnnualTargetOverride for a year (FR-M6-03). The amount is parsed
 * to an exact decimal string here; the note is optional (OQ3 — recommended, not
 * required, unlike M4's Confirmed-Collectible note). Friction-gated: the request is
 * refused unless the explicit confirmation token is present (AC7).
 */
export async function setAnnualTargetOverride(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const year = readYear(formData);
  if (year === null) return { error: "Which year? Reload the page and try again." };

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const rawAmount = String(formData.get("amount") ?? "").trim();
  const parsed = parseAmountInput(rawAmount);
  if (!parsed || parsed.lessThanOrEqualTo(0)) {
    return { error: "Enter an annual target greater than zero." };
  }
  const amount = parsed.toFixed(2);

  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 240) {
    return { error: "That note is too long — keep it under 240 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_annual_target_override", {
    p_year: year,
    p_amount: amount,
    p_note: note === "" ? null : note,
  });

  if (error) return { error: `Could not save the target override: ${error.message}` };

  const result = data as unknown as OverrideResult;
  if (!result?.ok) {
    if (result?.reason === "invalid_amount") {
      return { error: "Enter an annual target greater than zero." };
    }
    if (result?.reason === "invalid_year") {
      return { error: "That year is out of range. Reload the page and try again." };
    }
    if (result?.reason === "note_too_long") {
      return { error: "That note is too long — keep it under 240 characters." };
    }
    return { error: "Could not save the target override. Reload and try again." };
  }

  revalidateDashboard();
  return {
    error: null,
    message: `Annual target for ${year} set to ${formatPHP(result.amount ?? amount)}.`,
  };
}

/**
 * Clear the AnnualTargetOverride for a year (FR-M6-03) — the target reverts to the
 * TargetTable derivation (or "—" until M3 lands). Friction-gated + audited; a no-op
 * when none exists.
 */
export async function clearAnnualTargetOverride(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const year = readYear(formData);
  if (year === null) return { error: "Which year? Reload the page and try again." };

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_annual_target_override", {
    p_year: year,
  });

  if (error) return { error: `Could not clear the target override: ${error.message}` };

  const result = data as unknown as OverrideResult;
  if (!result?.ok) {
    return { error: "Could not clear the target override. Reload and try again." };
  }

  revalidateDashboard();
  if (!result.changed) {
    return { error: null, message: "Nothing to clear — no override was set for that year." };
  }
  return {
    error: null,
    message: `Override cleared — ${year}'s target reverts to the derived goal.`,
  };
}
