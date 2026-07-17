/**
 * Friction gates — the v1 replacement for role-gating (M0 §3.2, rule 9).
 *
 * v1 has exactly one human per workspace, so there is nothing to gate between
 * *people*. What the team workbook reserved for the principal — rate changes,
 * editing a deal that has payments, close/cancel, deleting anything — is instead
 * gated on **deliberateness**: an explicit typed or checked confirmation, plus an
 * audit entry. Every module's "requires Owner/Admin" maps to "requires
 * confirmation" here.
 *
 * WHY THE CHECK LIVES SERVER-SIDE
 *
 * A modal the client could skip is theater. M0's test plan (#7) is explicit:
 * every money-restating mutation *requires the confirmation token; API calls
 * without it are rejected*. So the gate is a contract on the payload — the
 * action refuses to proceed unless the confirmation is present and correct — and
 * `ConfirmGate` is merely the UI that collects it.
 *
 * To be clear about what this is not: it is not an authorization boundary. The
 * agent may confirm anything in their own workspace — that is the point. It
 * makes an irreversible act deliberate, and RLS (not this) is what keeps tenants
 * apart.
 *
 * WHEN TO USE ONE
 *
 * Destructive or money-restating actions only (M0 §3.2). Gating an ordinary edit
 * — renaming the workspace, say — trains the agent to confirm without reading,
 * which is how the gate stops working on the day it matters.
 */

/** The form field carrying the confirmation. One name, checked in one place. */
export const CONFIRMATION_FIELD = "confirmation";

/** The value a `checked` gate submits. */
export const CHECKED_VALUE = "acknowledged";

/**
 * `typed` — the agent retypes `phrase` (irreversible acts: delete the account,
 * write off a receivable). `checked` — the agent ticks an acknowledgement
 * (restatements that are serious but recoverable: a tax-rate change).
 */
export type FrictionGate =
  | { mode: "typed"; phrase: string }
  | { mode: "checked" };

export type GateResult = { ok: true } | { ok: false; error: string };

/**
 * The server-side half of the contract. Call this FIRST in any gated action,
 * before touching the database.
 */
export function checkConfirmation(
  formData: FormData,
  gate: FrictionGate
): GateResult {
  const submitted = formData.get(CONFIRMATION_FIELD);

  if (typeof submitted !== "string") {
    return { ok: false, error: "This action requires confirmation." };
  }

  if (gate.mode === "checked") {
    return submitted === CHECKED_VALUE
      ? { ok: true }
      : { ok: false, error: "Tick the confirmation to continue." };
  }

  // Trimmed (a trailing space from a phone keyboard is not a different answer)
  // but case-sensitive: retyping the exact phrase is the whole ritual.
  return submitted.trim() === gate.phrase
    ? { ok: true }
    : { ok: false, error: `Type ${gate.phrase} exactly to continue.` };
}
