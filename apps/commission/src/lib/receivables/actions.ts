"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { parseAmountInput, formatPHP } from "@/lib/money";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The receivable's user-editable fields (M4.1's slice: FR-M4-06 Confirmed
 * Collectible, FR-M4-07 Next Action note). Status transitions and the full
 * override friction-gate/restated-flag UX are M4.3. Same shape as every mutation
 * since M0.2: authenticate, then let ONE database function do the change + its
 * audit entry in a single transaction. The note-required rule (edge case 17) and
 * tenant isolation are enforced server-side — the DB function is the safeguard,
 * not the (later) modal.
 */

type ReceivableResult = {
  ok: boolean;
  changed?: boolean;
  reason?: "note_required" | "invalid_amount" | "note_too_long";
  id?: string;
  total_collectible?: string;
  default_total_collectible?: string;
  confirmed_collectible?: string | null;
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

function revalidateReceivables(): void {
  revalidatePath(ROUTES.collectibles);
  revalidatePath(ROUTES.settingsAuditLog);
}

// --- Next Action note (FR-M4-07) --------------------------------------------

export async function setNextActionNote(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which receivable? Reload the page and try again." };
  const note = String(formData.get("note") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_next_action_note", {
    p_receivable_id: id,
    p_note: note,
  });

  if (error) return { error: `Could not save your note: ${error.message}` };

  const result = data as unknown as ReceivableResult;
  if (!result?.ok) {
    if (result?.reason === "note_too_long") {
      return { error: "That note is too long — keep it under 500 characters." };
    }
    return { error: "Could not save your note. Reload and try again." };
  }

  revalidateReceivables();
  if (!result.changed) {
    return { error: null, message: "Nothing changed — the note is as it was." };
  }
  return { error: null, message: "Next action saved." };
}

// --- Confirmed Collectible override (FR-M4-06; edge case 17) -----------------

/**
 * The note is REQUIRED when setting a value (edge case 17 — the note is the
 * override's audit trail). The amount is parsed to an exact decimal string here;
 * an empty amount clears the override back to the Rule K.2 default.
 */
export async function setConfirmedCollectible(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which receivable? Reload the page and try again." };

  const rawAmount = String(formData.get("confirmedCollectible") ?? "").trim();
  const note = String(formData.get("note") ?? "");

  // Empty amount = clear the override (revert to default). A non-empty amount must
  // parse to a positive decimal.
  let value: string | null = null;
  if (rawAmount !== "") {
    const parsed = parseAmountInput(rawAmount);
    if (!parsed || parsed.lessThanOrEqualTo(0)) {
      return { error: "Enter a confirmed amount greater than zero, or clear it to use the booked default." };
    }
    value = parsed.toFixed(2);
    // Mirror the DB friction gate so the message is specific before the round-trip.
    if (note.trim() === "") {
      return {
        error:
          "The note is the override's audit trail — say why (e.g. \"CLI advice 7/20: base excl. promo disc — confirmed 303,806\").",
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_confirmed_collectible", {
    p_receivable_id: id,
    p_value: value,
    p_note: note,
  });

  if (error) return { error: `Could not save the confirmed collectible: ${error.message}` };

  const result = data as unknown as ReceivableResult;
  if (!result?.ok) {
    if (result?.reason === "note_required") {
      return {
        error:
          "The note is the override's audit trail — say why before confirming a different collectible.",
      };
    }
    if (result?.reason === "invalid_amount") {
      return { error: "Enter a confirmed amount greater than zero." };
    }
    if (result?.reason === "note_too_long") {
      return { error: "That note is too long — keep it under 500 characters." };
    }
    return { error: "Could not save the confirmed collectible. Reload and try again." };
  }

  revalidateReceivables();
  if (value === null) {
    return {
      error: null,
      message: `Override cleared — Total Collectible is back to the booked ${formatPHP(result.default_total_collectible ?? "0")}.`,
    };
  }
  return {
    error: null,
    message: `Confirmed Collectible set — Total Collectible is now ${formatPHP(result.total_collectible ?? "0")}.`,
  };
}
