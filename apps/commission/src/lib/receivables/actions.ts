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
  reason?:
    | "note_required"
    | "invalid_amount"
    | "note_too_long"
    | "stale_version"
    | "not_open"
    | "not_reopenable"
    | "reason_required"
    | "reason_too_long";
  id?: string;
  status?: string;
  total_collectible?: string;
  default_total_collectible?: string;
  confirmed_collectible?: string | null;
  variance?: string | null;
  written_off?: string | null;
  balance?: string | null;
};

/** Parse the optimistic-lock version off a status-transition form. */
function readVersion(formData: FormData): number | null {
  const v = Number(formData.get("expectedVersion"));
  return Number.isInteger(v) ? v : null;
}

/**
 * The reopen-since-changed message shared by the "someone edited this" branch of
 * every version-locked transition.
 */
const STALE_MESSAGE =
  "This receivable changed since you opened it. Reload to see the current status, then try again.";

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
  // The dynamic detail page shares the receivable's data — revalidate the whole
  // /collectibles/[dealCode] segment so a transition/override shows on it too.
  revalidatePath("/collectibles/[dealCode]", "page");
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

// --- Status lifecycle (FR-M4-05; §4 rule 6) ---------------------------------

/**
 * Every money-restating transition is FRICTION-GATED (M0 §3.2): the action refuses
 * unless the explicit confirmation token is present — a request without it is
 * rejected before the DB is touched (AC7), the v1 replacement for the workbook's
 * Owner/Admin restriction. Each carries the receivable's optimistic-lock version so
 * a concurrent edit can't be silently clobbered. The DB function is the single
 * writer + audit; these map its result to specific copy.
 */
function gateTransition(
  formData: FormData
): { ok: true; id: string; version: number } | { ok: false; error: string } {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Which receivable? Reload the page and try again." };

  const version = readVersion(formData);
  if (version === null) return { ok: false, error: "Reload the page and try again." };

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { ok: false, error: confirmation.error };

  return { ok: true, id, version };
}

/**
 * Close a receivable (Open → Closed). The payor has finished paying; the balance
 * becomes Variance (Rule N) — negative when they paid short, which the Corrections
 * doctrine deliberately keeps visible (§3.3 case 3). The confirmation dialog
 * previewing the variance is M4.4's; the gate + audit are here now.
 */
export async function closeReceivable(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const gate = gateTransition(formData);
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_receivable", {
    p_receivable_id: gate.id,
    p_expected_version: gate.version,
  });

  if (error) return { error: `Could not close the receivable: ${error.message}` };

  const result = data as unknown as ReceivableResult;
  if (!result?.ok) {
    if (result?.reason === "stale_version") return { error: STALE_MESSAGE };
    if (result?.reason === "not_open") {
      return { error: "Only an Open receivable can be closed. Reload to see its current status." };
    }
    return { error: "Could not close the receivable. Reload and try again." };
  }

  revalidateReceivables();
  const variance = result.variance ?? "0";
  return {
    error: null,
    message: `Closed — variance ${formatPHP(variance)}. ${
      Number(variance) < 0
        ? "The shortfall stays visible in your stats."
        : Number(variance) > 0
          ? "It over-collected; the extra is recorded."
          : "Collected in full."
    }`,
  };
}

/**
 * Cancel a receivable (Open → Cancelled). The deal died; the uncollected remainder
 * is written off (Rule O) and cash already collected is kept (§4 rule 10). A
 * free-text reason is REQUIRED (Q20 default) and captured on the audit trail.
 */
export async function cancelReceivable(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const gate = gateTransition(formData);
  if (!gate.ok) return { error: gate.error };

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason === "") {
    return { error: "Say why you're cancelling — the reason is the write-off's audit trail." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_receivable", {
    p_receivable_id: gate.id,
    p_expected_version: gate.version,
    p_reason: reason,
  });

  if (error) return { error: `Could not cancel the receivable: ${error.message}` };

  const result = data as unknown as ReceivableResult;
  if (!result?.ok) {
    if (result?.reason === "stale_version") return { error: STALE_MESSAGE };
    if (result?.reason === "reason_required") {
      return { error: "Say why you're cancelling — the reason is the write-off's audit trail." };
    }
    if (result?.reason === "reason_too_long") {
      return { error: "That reason is too long — keep it under 500 characters." };
    }
    if (result?.reason === "not_open") {
      return { error: "Only an Open receivable can be cancelled. Reload to see its current status." };
    }
    return { error: "Could not cancel the receivable. Reload and try again." };
  }

  revalidateReceivables();
  return {
    error: null,
    message: `Cancelled — ${formatPHP(result.written_off ?? "0")} written off. Cash already collected is kept.`,
  };
}

/**
 * Reopen a receivable (Closed or Cancelled → Open). Unlimited and audit-logged
 * (§4 rule 6, OQ4): a premature close or a revived dead deal. Balance and aging
 * resume; variance/write-off clear. Also the target of M5.2's fast-entry banner
 * "Reopen receivable" affordance so a late payment lands on an Open receivable.
 */
export async function reopenReceivable(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const gate = gateTransition(formData);
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reopen_receivable", {
    p_receivable_id: gate.id,
    p_expected_version: gate.version,
  });

  if (error) return { error: `Could not reopen the receivable: ${error.message}` };

  const result = data as unknown as ReceivableResult;
  if (!result?.ok) {
    if (result?.reason === "stale_version") return { error: STALE_MESSAGE };
    if (result?.reason === "not_reopenable") {
      return { error: "This receivable is already Open. Reload to see its current status." };
    }
    return { error: "Could not reopen the receivable. Reload and try again." };
  }

  revalidateReceivables();
  return {
    error: null,
    message: `Reopened — balance tracking has resumed (${formatPHP(result.balance ?? "0")}).`,
  };
}

// --- Restated-override review flag (§4 rule 7) ------------------------------

/**
 * Clear the "deal restated since override — review" flag once the agent has looked
 * and the confirmed figure still stands. A plain audited edit (no money moves), so
 * no friction gate — the equivalent of re-confirming the override without changing
 * it. Re-confirming/clearing the override itself also clears the flag.
 */
export async function reviewOverrideFlag(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bad = await guard();
  if (bad) return bad;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which receivable? Reload the page and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_override_review_flag", {
    p_receivable_id: id,
  });

  if (error) return { error: `Could not clear the review flag: ${error.message}` };

  const result = data as unknown as ReceivableResult;
  if (!result?.ok) return { error: "Could not clear the review flag. Reload and try again." };

  revalidateReceivables();
  if (!result.changed) {
    return { error: null, message: "Nothing to review — the flag was already clear." };
  }
  return { error: null, message: "Reviewed — the confirmed collectible stands." };
}

