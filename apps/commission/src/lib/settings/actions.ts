"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { checkConfirmation } from "@/lib/friction/gate";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";
import { invalidateTaxSettings } from "./cache";
import { countAffectedDeals } from "./recompute-queries";
import { kickoffRecompute } from "./recompute-runner";
import {
  TAX_FIELD_LABELS,
  diffTaxSettings,
  parseTaxSettingsForm,
  requiresConfirmation,
  restatingFields,
  type TaxField,
  type TaxSettingsValues,
} from "./tax";

/**
 * Tax settings write path (FR-M0-03).
 *
 * THE ORDER OF THE CHECKS BELOW IS THE FEATURE. In sequence: authenticate,
 * validate, diff, and only then decide whether a confirmation is required —
 * *server-side*, from the diff, never from a flag the client sent. A request
 * that skips the modal entirely reaches the same `requiresConfirmation` and is
 * refused (M0 test plan #7). The modal collects the answer; this decides.
 *
 * The write itself is one `update_tax_settings` RPC because the update, the
 * audit entry (rule 12) and the recompute event (rule 3) must be atomic —
 * PostgREST wraps a request in a transaction, two calls have no such guarantee,
 * and an unaudited rate change is precisely what rule 12 forbids. This closes
 * the caveat M0.1 recorded against its update-then-audit rename: that path is
 * gone, and `app.write_audit_entry` is now reachable only from inside a
 * mutation function.
 */

const CONFIRM_VAT_REGISTRATION_FIELD = "confirmVatRegistration";

/** Only the fields that changed go to the RPC; NULL there means "leave alone". */
function rpcArgsFor(
  changed: readonly TaxField[],
  next: TaxSettingsValues,
  confirmVatRegistration: boolean,
  affectedDeals: number
) {
  const has = (field: TaxField) => changed.includes(field);

  return {
    // Strings, not numbers. PostgREST casts a JSON string straight to numeric;
    // a JSON number would already have been through a double (Master PRD §4.3).
    p_vat_rate: has("vat_rate") ? next.vat_rate : undefined,
    p_ewt_rate: has("ewt_rate") ? next.ewt_rate : undefined,
    p_property_vat_threshold: has("property_vat_threshold")
      ? next.property_vat_threshold
      : undefined,
    p_chase_idle_months: has("chase_idle_months")
      ? next.chase_idle_months
      : undefined,
    p_vat_registered: has("vat_registered") ? next.vat_registered : undefined,
    p_confirm_vat_registration: confirmVatRegistration,
    p_affected_deal_count: affectedDeals,
  };
}

/**
 * Turns a Postgres constraint violation into something the agent can act on.
 *
 * These are unreachable through the UI — the same ranges are checked in
 * `parseTaxSettingsForm` first. They are reachable by a forged request, which is
 * the point: the constraint is the enforcement (M0.2 DoD: "invalid values
 * rejected server-side"), and this only decides how the refusal reads.
 */
function describeDatabaseError(message: string): string {
  if (message.includes("tax_settings_vat_rate_range")) {
    return "VAT rate must be more than 0% and less than 100%.";
  }
  if (message.includes("tax_settings_ewt_rate_range")) {
    return "EWT rate must be 0% or more and less than 100%.";
  }
  if (message.includes("tax_settings_threshold_positive")) {
    return "Property VAT threshold must be more than ₱0.00.";
  }
  if (message.includes("tax_settings_chase_idle_min")) {
    return "Chase idle threshold must be at least 1 month.";
  }
  return `Could not save your tax settings: ${message}`;
}

export async function saveTaxSettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
    };
  }

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  if (!context.taxSettings) {
    return {
      error:
        "No tax settings exist for this workspace. The signup bootstrap did not run — report this rather than retrying.",
    };
  }

  const parsed = parseTaxSettingsForm({
    vatRatePercent: String(formData.get("vatRatePercent") ?? ""),
    ewtRatePercent: String(formData.get("ewtRatePercent") ?? ""),
    propertyVatThreshold: String(formData.get("propertyVatThreshold") ?? ""),
    chaseIdleMonths: String(formData.get("chaseIdleMonths") ?? ""),
    vatRegistered: formData.get("vatRegistered") === "on",
  });

  if (!parsed.ok) {
    const first = Object.entries(parsed.errors)[0];
    if (!first) return { error: "Check the values and try again." };
    const [field, message] = first as [TaxField, string];
    return { error: `${TAX_FIELD_LABELS[field]}: ${message}` };
  }

  const current = context.taxSettings;
  const before: TaxSettingsValues = {
    vat_rate: current.vat_rate,
    vat_registered: current.vat_registered,
    ewt_rate: current.ewt_rate,
    property_vat_threshold: current.property_vat_threshold,
    chase_idle_months: current.chase_idle_months,
  };

  const changed = diffTaxSettings(before, parsed.values);
  const answeringVatQuestion =
    formData.get(CONFIRM_VAT_REGISTRATION_FIELD) === "on";

  if (changed.length === 0 && !answeringVatQuestion) {
    return { error: null, message: "Nothing changed — your settings are as they were." };
  }

  // The gate, decided from the server's own diff. A client that never rendered
  // the modal lands here exactly the same way.
  if (requiresConfirmation(changed)) {
    const confirmation = checkConfirmation(formData, { mode: "checked" });
    if (!confirmation.ok) return { error: confirmation.error };
  }

  // The honest count for the SPECIFIC restating fields being saved — recorded on
  // the emitted event as "what the agent was told". Zero when nothing restates.
  const restating = restatingFields(changed);
  const affectedDeals =
    restating.length > 0
      ? await countAffectedDeals({ entity: "tax_settings", fields: restating })
      : 0;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "update_tax_settings",
    rpcArgsFor(
      changed,
      parsed.values,
      // Changing the answer IS answering the question; the explicit tick is for
      // confirming the default without changing it. The function itself decides
      // whether that actually re-stamps the date.
      answeringVatQuestion || changed.includes("vat_registered"),
      affectedDeals
    )
  );

  if (error) return { error: describeDatabaseError(error.message) };

  const result = data as {
    changed: boolean;
    field_changes: Record<string, unknown>;
    recompute_event_id: string | null;
  } | null;

  if (!result) {
    return { error: "The save did not go through. Sign in again and retry." };
  }

  // Both halves matter: the cache would otherwise serve the old rate for up to
  // five minutes (the agent would assume the save failed), and the audit viewer
  // is a separate route with its own cached render.
  invalidateTaxSettings(context.workspace.id);
  revalidatePath(ROUTES.settingsTax);
  revalidatePath(ROUTES.settingsAuditLog);

  if (!result.changed) {
    return { error: null, message: "Nothing changed — your settings are as they were." };
  }

  const savedFields = Object.keys(result.field_changes)
    .filter((field): field is TaxField => field in TAX_FIELD_LABELS)
    .map((field) => TAX_FIELD_LABELS[field]);

  const summary =
    savedFields.length > 0 ? `Saved: ${savedFields.join(", ")}.` : "Saved.";

  if (!result.recompute_event_id) {
    return { error: null, message: `${summary} Recorded in your audit log.` };
  }

  // Drain the recompute now (FR-M1-07). The settings change already committed
  // with its durable event, so a drain failure never loses the work — it stays
  // pending and the recompute banner resumes it. The result folds the restated
  // count into the message.
  const recompute = await kickoffRecompute(result.recompute_event_id);
  return {
    error: null,
    message:
      recompute.status === "completed"
        ? `${summary} ${recompute.restated} ${recompute.restated === 1 ? "deal" : "deals"} restated and recorded in your audit log.`
        : `${summary} Restating your deals is in progress — see the recompute banner. Recorded in your audit log.`,
  };
}
