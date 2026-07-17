"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { checkConfirmation } from "@/lib/friction/gate";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getReceivableByDealId } from "@/lib/receivables/queries";
import { manilaToday } from "@/lib/date/manila";
import { formatPHP } from "@/lib/money";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";
import type { TaxSettings } from "@/types/entities";
import { derivePaymentSnapshot } from "./compute";
import { createPaymentRpcArgs, updatePaymentRpcArgs } from "./map";
import { parsePayment, type PaymentInput, type RawPayment } from "./schema";
import { computePaymentWarnings, type PaymentWarning } from "./warnings";
import { findDuplicatePayments, resolvePaymentDeal } from "./queries";

/**
 * The payment write path (FR-M5-01/07/08). Same shape as every mutation since
 * M0.2: authenticate, validate, run the engine for the split, then let ONE
 * database function do the insert/update/soft-delete, its audit entry and its
 * payment event in a single transaction (the function is the single writer, and
 * it re-checks the split's pure ties).
 *
 * WHAT THE SERVER DECIDES, NOT THE CLIENT
 *   - the split (computed here from the referenced deal + current tax settings via
 *     M1's engine, never trusted from the payload — §3.2, there is no UI math);
 *   - the referential integrity (the deal must exist, be same-workspace and
 *     non-archived — edge case 10);
 *   - whether an edit/delete is confirmed (the friction gate, rule 11) and stale
 *     (the version the function read, not the form's).
 *
 * Warnings (§4, FR-M5-04) are computed and RETURNED — they never block a save.
 * M5.2's UI renders them as amber banners with "Continue anyway" (audit-logged);
 * the importer ignores them (historical fact, accepted silently, OQ5).
 */

export type PaymentActionState = ActionState & {
  /** Non-blocking warnings for the just-saved payment (§4). */
  warnings?: PaymentWarning[];
  /** The created/updated payment id (M5.2's toast + undo affordance). */
  paymentId?: string;
};

type PaymentResult = {
  ok: boolean;
  changed?: boolean;
  reason?: "stale_version";
  id?: string;
  deal_id?: string;
  net_of_vat?: string;
  vat_amount?: string;
  ewt_amount?: string;
  net_cash?: string;
  retained_cash?: string;
  version?: number;
  current_version?: number;
};

function notConfigured(): PaymentActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

function revalidatePayments(): void {
  revalidatePath(ROUTES.payments);
  revalidatePath(ROUTES.collectibles);
  revalidatePath(ROUTES.deals);
  revalidatePath(ROUTES.settingsAuditLog);
}

type Ready = { ok: true; taxSettings: TaxSettings };

/** Shared preamble: config check, session, and the tax settings the split needs. */
async function guard(): Promise<Ready | { ok: false; state: PaymentActionState }> {
  if (!isSupabaseConfigured()) return { ok: false, state: notConfigured() };

  const context = await getWorkspaceContext();
  if (!context) {
    return { ok: false, state: { error: "Your session has expired. Sign in again." } };
  }
  if (!context.taxSettings) {
    return {
      ok: false,
      state: { error: "Set up your tax settings before logging a payment." },
    };
  }
  return { ok: true, taxSettings: context.taxSettings };
}

/** FormData → the flat raw record parsePayment reads. */
function rawFromForm(formData: FormData): RawPayment {
  const raw: RawPayment = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = typeof value === "string" ? value : null;
  }
  return raw;
}

function describeError(message: string): string {
  // The DB's own guards, turned into sentences. Unreachable from a valid form
  // (the boundary validation + deal resolution catch them first), but a forged or
  // stale request must still get an answer, not a 500.
  if (message.includes("deal_not_found")) {
    return "That deal no longer exists, or is not in this workspace.";
  }
  if (message.includes("deal_archived")) {
    return "That deal is archived — restore it before logging a payment against it.";
  }
  if (message.includes("payment_gross_positive")) {
    return "The gross commission must be greater than zero.";
  }
  if (message.includes("payment split violates")) {
    return "Those figures don't add up — reload the form so the split is recomputed, then try again.";
  }
  if (message.includes("violates foreign key")) {
    return "That deal reference is invalid. Reload the form and try again.";
  }
  return `Could not save the payment: ${message}`;
}

/**
 * Compute the applicable warnings for a payment (§4). Reads the deal's receivable
 * status and any same-deal/gross/date duplicates; `today` is Asia/Manila (rule
 * 20). Best-effort — a warning read failing must never block the save it advises.
 */
async function collectWarnings(
  input: PaymentInput,
  bookedDate: string,
  excludeId?: string
): Promise<PaymentWarning[]> {
  try {
    const [receivable, duplicates] = await Promise.all([
      getReceivableByDealId(input.deal_id),
      findDuplicatePayments(input.deal_id, input.gross_amount, input.payment_date, excludeId),
    ]);
    return computePaymentWarnings({
      input,
      bookedDate,
      today: manilaToday(),
      receivableStatus: receivable?.status ?? null,
      duplicates,
    });
  } catch {
    return [];
  }
}

// --- create (FR-M5-01) ------------------------------------------------------

export async function createPayment(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const parsed = parsePayment(rawFromForm(formData));
  if (!parsed.ok) return { error: parsed.error };

  const deal = await resolvePaymentDeal(parsed.value.deal_id);
  if (!deal.ok) return { error: deal.error };

  const snap = derivePaymentSnapshot(parsed.value, deal.deal, g.taxSettings);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_payment",
    createPaymentRpcArgs(parsed.value, snap)
  );

  if (error) return { error: describeError(error.message) };

  const result = data as unknown as PaymentResult;
  if (!result?.ok) return { error: "Could not save the payment. Reload and try again." };

  const warnings = await collectWarnings(parsed.value, deal.deal.booked_date);

  revalidatePayments();
  return {
    error: null,
    message: `Logged ${formatPHP(parsed.value.gross_amount)} against ${deal.deal.display_label} — Net Cash ${formatPHP(result.net_cash ?? "0")}.`,
    warnings,
    paymentId: result.id,
  };
}

// --- update (FR-M5-07 + friction gate rule 11 + optimistic locking §8) -------

export async function updatePayment(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which payment? Reload the page and try again." };

  const expectedVersion = Number(formData.get("expectedVersion"));
  if (!Number.isInteger(expectedVersion)) {
    return { error: "Reload the page and try again." };
  }

  // Rule 11 friction gate — an edit re-states money, so it requires an explicit
  // acknowledgment (server-side, not a modal the client could skip).
  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const parsed = parsePayment(rawFromForm(formData));
  if (!parsed.ok) return { error: parsed.error };

  const deal = await resolvePaymentDeal(parsed.value.deal_id);
  if (!deal.ok) return { error: deal.error };

  // §3.3.2 — an edit RE-SNAPSHOTS at the deal/settings as they are NOW.
  const snap = derivePaymentSnapshot(parsed.value, deal.deal, g.taxSettings);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "update_payment",
    updatePaymentRpcArgs(id, expectedVersion, parsed.value, snap)
  );

  if (error) return { error: describeError(error.message) };

  const result = data as unknown as PaymentResult;
  if (!result?.ok) {
    if (result?.reason === "stale_version") {
      return {
        error:
          "This payment changed since you opened it. Reload to see the current version, then reapply your edit.",
      };
    }
    return { error: "Could not save the payment. Reload and try again." };
  }

  revalidatePayments();

  if (!result.changed) {
    return { error: null, message: "Nothing changed — the payment is as it was." };
  }

  const warnings = await collectWarnings(parsed.value, deal.deal.booked_date, id);
  return {
    error: null,
    message: `Updated the payment against ${deal.deal.display_label} — Net Cash ${formatPHP(result.net_cash ?? "0")}. Recorded in your audit log.`,
    warnings,
    paymentId: result.id,
  };
}

// --- delete (soft, FR-M5-08 + friction gate rule 11) ------------------------

export async function deletePayment(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which payment? Reload the page and try again." };

  const expectedVersion = Number(formData.get("expectedVersion"));
  if (!Number.isInteger(expectedVersion)) {
    return { error: "Reload the page and try again." };
  }

  // Rule 11 friction gate — deleting restates the receivable, so it is confirmed
  // (the confirmation states the restatement in M5.2's UI).
  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_payment", {
    p_id: id,
    p_expected_version: expectedVersion,
  });

  if (error) return { error: `Could not delete the payment: ${error.message}` };

  const result = data as unknown as PaymentResult;
  if (!result?.ok) {
    if (result?.reason === "stale_version") {
      return {
        error:
          "This payment changed since you opened it. Reload to see the current version, then try again.",
      };
    }
    return { error: "Could not delete the payment. Reload and try again." };
  }

  revalidatePayments();

  if (!result.changed) {
    return { error: null, message: "That payment was already deleted." };
  }

  return {
    error: null,
    message: "Payment deleted. Its receivable will be restated.",
    paymentId: result.id,
  };
}
