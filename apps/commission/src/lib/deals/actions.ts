"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { checkConfirmation } from "@/lib/friction/gate";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { formatPHP } from "@/lib/money";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";
import type { TaxSettings } from "@/types/entities";
import { deriveDeal } from "./compute";
import { buildComputeInput, dealRpcArgs, type DealComputeRefs } from "./map";
import { parseDeal, type DealInput, type RawDeal } from "./schema";
import { computeDealWarnings } from "./deal-warnings";
import { dealPaymentCount, findPossibleDuplicates, resolveDealRefs } from "./queries";
import { consumeReceivableEvents } from "@/lib/receivables/consume";

type DealClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Project the deal event(s) this mutation just emitted onto their receivables
 * (M4.1, FR-M4-01/02/03) — synchronously, so a deal is never visible without its
 * receivable (monolith-first). Best-effort: the deal is already committed, and the
 * cursor-based consumer heals any miss on the next call, so a transient sync error
 * must not turn a successful save into a failure. Runs before revalidation so the
 * refreshed views see the receivable.
 */
async function syncReceivables(): Promise<void> {
  try {
    await consumeReceivableEvents();
  } catch (error) {
    console.error("receivable sync after deal mutation failed:", error);
  }
}

/**
 * The audited-override half of FR-M1-11. Soft warnings never block a save; when
 * a deal is saved with warnings active, that decision is recorded on the deal's
 * audit trail ("Continue anyway (audit-logged)", §6). Recomputed SERVER-SIDE
 * from the same predicates the preview used, so the record is the truth, not
 * whatever the client claimed. Best-effort: a failed override note must never
 * fail the save that already succeeded.
 */
async function logWarningOverride(
  supabase: DealClient,
  dealId: string,
  input: DealInput,
  refs: DealComputeRefs,
  excludeId?: string
): Promise<void> {
  try {
    const duplicates = await findPossibleDuplicates(input, excludeId);
    const warnings = computeDealWarnings(buildComputeInput(input, refs), duplicates);
    if (warnings.length === 0) return;
    await supabase.rpc("log_deal_warning_override", {
      p_deal_id: dealId,
      p_warnings: warnings.map((w) => w.key),
    });
  } catch {
    // The deal is saved; the override note is a courtesy. Never surface this.
  }
}

/** FormData → the flat raw record parseDeal reads. File values become null. */
function rawFromForm(formData: FormData): RawDeal {
  const raw: RawDeal = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = typeof value === "string" ? value : null;
  }
  return raw;
}

/**
 * The deal write path (FR-M1-01/03/04). Same shape as every mutation in the
 * codebase since M0.2: authenticate, validate, run the engine, then let ONE
 * database function do the insert/update, its audit entry and its deal event in
 * a single transaction. There is no compute-then-write-then-audit split — the
 * function is the single writer, and it re-checks the engine's composition.
 *
 * WHAT THE SERVER DECIDES, NOT THE CLIENT
 *   - the money figures (computed here from tax settings + the resolved refs,
 *     never trusted from the payload);
 *   - whether a confirmation is required (payment count, read server-side);
 *   - whether an edit is stale (the version the function read, not the form's).
 *
 * Every action returns ActionState rather than throwing: a stale version, a
 * blocked delete and a validation error are all expected outcomes.
 */

/** The RPC result shape shared by the deal functions. */
type DealResult = {
  ok: boolean;
  changed?: boolean;
  reason?: "stale_version" | "has_payments";
  id?: string;
  deal_code?: string;
  net_gci?: string;
  version?: number;
  current_version?: number;
  payment_count?: number;
};

function notConfigured(): ActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

function revalidateDeals(): void {
  revalidatePath(ROUTES.deals);
  revalidatePath(ROUTES.settingsAuditLog);
  // Reference counts on the config lists move when a deal references an item.
  revalidatePath(ROUTES.settingsPropertyTypes);
  revalidatePath(ROUTES.settingsDevelopers);
  revalidatePath(ROUTES.settingsLeadSources);
}

type Ready = {
  ok: true;
  workspaceId: string;
  taxSettings: TaxSettings;
};

/** Shared preamble: config check, session, and the tax settings the engine needs. */
async function guard(): Promise<Ready | { ok: false; state: ActionState }> {
  if (!isSupabaseConfigured()) return { ok: false, state: notConfigured() };

  const context = await getWorkspaceContext();
  if (!context) {
    return { ok: false, state: { error: "Your session has expired. Sign in again." } };
  }
  if (!context.taxSettings) {
    return {
      ok: false,
      state: { error: "Set up your tax settings before logging a deal." },
    };
  }

  return { ok: true, workspaceId: context.workspace.id, taxSettings: context.taxSettings };
}

function describeError(message: string): string {
  // The DB's own guards, turned into sentences (§4). These are unreachable from a
  // valid form — the boundary validation catches them first — but a forged or
  // stale request must still get an answer, not a 500.
  if (message.includes("Rule G") || message.includes("Rule H")) {
    return "Those figures don't add up — reload the form so the numbers are recomputed, then try again.";
  }
  if (message.includes("deal_developer_pairing")) {
    return "Only developer deals carry a developer.";
  }
  if (message.includes("deal_transaction_deal_type_coupling")) {
    return "A rental's deal type must be N/A; a sale is Developer or Resale.";
  }
  if (message.includes("deal_commission_basis_pairing") || message.includes("deal_rate_pct_format")) {
    return "Choose either a percentage rate or a fixed amount — not both.";
  }
  if (message.includes("deal_list_price_positive")) {
    return "The list price must be greater than zero.";
  }
  if (message.includes("violates foreign key")) {
    return "One of the selected items no longer exists. Reload the form and try again.";
  }
  return `Could not save the deal: ${message}`;
}

// --- create (FR-M1-01) ------------------------------------------------------

export async function createDeal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const parsed = parseDeal(rawFromForm(formData));
  if (!parsed.ok) return { error: parsed.error };

  const refs = await resolveDealRefs(parsed.value);
  if (!refs.ok) return { error: refs.error };

  const derived = deriveDeal(parsed.value, refs.refs, g.taxSettings);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_deal",
    dealRpcArgs(parsed.value, derived)
  );

  if (error) return { error: describeError(error.message) };

  const result = data as unknown as DealResult;
  if (!result?.ok) return { error: "Could not save the deal. Reload and try again." };

  if (result.id) {
    // Exclude the row we just inserted, or the duplicate guard matches it
    // against itself and logs a phantom override.
    await logWarningOverride(supabase, result.id, parsed.value, refs.refs, result.id);
  }

  // FR-M4-01: the receivable is auto-created from the deal.created event before the
  // deal becomes visible.
  await syncReceivables();

  revalidateDeals();
  return {
    error: null,
    message: `Logged ${result.deal_code} — NET GCI ${formatPHP(result.net_gci ?? "0")}.`,
  };
}

// --- update (FR-M1-03 + optimistic locking §8) ------------------------------

export async function updateDeal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which deal? Reload the page and try again." };

  const expectedVersion = Number(formData.get("expectedVersion"));
  if (!Number.isInteger(expectedVersion)) {
    return { error: "Reload the page and try again." };
  }

  const parsed = parseDeal(rawFromForm(formData));
  if (!parsed.ok) return { error: parsed.error };

  // Edit-after-payments friction gate (edge case 13). The decision is server-
  // side from the payment count, not from whether the client rendered a modal.
  // Zero until M5 makes the count real — then the gate starts firing here with
  // no change to this action.
  if ((await dealPaymentCount(id)) > 0) {
    const confirmation = checkConfirmation(formData, { mode: "checked" });
    if (!confirmation.ok) return { error: confirmation.error };
  }

  const refs = await resolveDealRefs(parsed.value);
  if (!refs.ok) return { error: refs.error };

  const derived = deriveDeal(parsed.value, refs.refs, g.taxSettings);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_deal", {
    p_id: id,
    p_expected_version: expectedVersion,
    ...dealRpcArgs(parsed.value, derived),
  });

  if (error) return { error: describeError(error.message) };

  const result = data as unknown as DealResult;

  if (!result?.ok) {
    if (result?.reason === "stale_version") {
      // The conflict signal M1.3 turns into "someone changed this deal — reload".
      return {
        error:
          "This deal changed since you opened it. Reload to see the current version, then reapply your edit.",
      };
    }
    return { error: "Could not save the deal. Reload and try again." };
  }

  if (result.changed) {
    await logWarningOverride(supabase, id, parsed.value, refs.refs, id);
  }

  // FR-M4-02: restate the receivable's mirrors + Rule K anchors from deal.updated.
  await syncReceivables();

  revalidateDeals();

  if (!result.changed) {
    return { error: null, message: "Nothing changed — the deal is as it was." };
  }

  return {
    error: null,
    message: `Updated ${result.deal_code} — NET GCI ${formatPHP(result.net_gci ?? "0")}. Recorded in your audit log.`,
  };
}

// --- archive / restore (FR-M1-04, rule 2) -----------------------------------

async function setArchived(
  formData: FormData,
  archived: boolean
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Reload the page and try again." };

  // Archive cascade confirmation (rule 2): once payments exist, archiving a deal
  // takes its receivable (and shows the N payments) with it, so it is gated.
  // Restoring, and archiving a childless deal, are not. Zero until M5.
  if (archived && (await dealPaymentCount(id)) > 0) {
    const confirmation = checkConfirmation(formData, { mode: "checked" });
    if (!confirmation.ok) return { error: confirmation.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_deal_archived", {
    p_id: id,
    p_archived: archived,
  });

  if (error) return { error: describeError(error.message) };

  const result = data as unknown as DealResult;
  if (!result?.ok) return { error: "Could not update that deal." };

  // FR-M4-03: archive/restore the receivable in step with the deal.
  await syncReceivables();

  revalidateDeals();

  if (!result.changed) {
    return { error: null, message: "Nothing changed — it is as it was." };
  }

  return {
    error: null,
    message: archived
      ? `Archived ${result.deal_code}. It is gone from your active deals; nothing was recomputed.`
      : `Restored ${result.deal_code}. It is back in your active deals.`,
  };
}

export async function archiveDeal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return setArchived(formData, true);
}

export async function restoreDeal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return setArchived(formData, false);
}

// --- delete (FR-M1-04, rule 2: never with financial children) ---------------

/**
 * Gated `checked`, not `typed`: a childless deal is a mistake to undo, and re-
 * entering it is retyping a form, not an irreversible loss. The RLS delete policy
 * — not this gate — is what actually stops a deal WITH payments from being
 * deleted; this explains the refusal and offers Archive.
 */
export async function deleteDeal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Reload the page and try again." };

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_deal", { p_id: id });

  if (error) return { error: describeError(error.message) };

  const result = data as unknown as DealResult;

  if (!result?.ok) {
    if (result?.reason === "has_payments") {
      // The blocked attempt is now in the audit trail.
      revalidateDeals();
      const n = result.payment_count ?? 0;
      return {
        error: `${result.deal_code ?? "This deal"} has ${n} payment${n === 1 ? "" : "s"} logged against it and cannot be deleted. Archive it instead — that keeps the payments and the receivable.`,
      };
    }
    return { error: "Could not delete that deal." };
  }

  revalidateDeals();
  return { error: null, message: `Deleted ${result.deal_code}. Its code is retired and will not be reused.` };
}
