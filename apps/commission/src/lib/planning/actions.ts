"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { parseAmountInput } from "@/lib/money";
import { checkConfirmation } from "@/lib/friction/gate";
import { planningTargetsTag } from "@/lib/dashboard/target-queries";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * M3.2 — the PlanYearTarget + FunnelRates write paths (FR-M3-01/02). Editing a
 * target or a rate is a money-planning act: the annual target drives M6's Section-2
 * pace line (rule 13/14), so every save is FRICTION-GATED (M0 §3.2, mode 'checked')
 * and the DB function is the single writer + audit (old→new). Same shape as every
 * mutation since M0.2: authenticate → gate → let ONE database function do the change
 * + its audit entry in one transaction. Tenant isolation is RLS (the RPC resolves the
 * workspace via app.current_workspace_id()).
 *
 * After any target write we invalidate the per-workspace planning-targets cache so
 * M6's derived Section-2 target reflects the change immediately (§8).
 */

type RpcResult = {
  ok: boolean;
  changed?: boolean;
  reason?: string;
  field?: string;
  year?: number;
};

function notConfigured(): ActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

async function guardWorkspaceId(): Promise<
  { workspaceId: string } | { error: string }
> {
  if (!isSupabaseConfigured()) return notConfigured() as { error: string };
  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };
  return { workspaceId: context.workspace.id };
}

/** Invalidate the planning-targets feed + restate the dashboard and audit log. */
function revalidateAfterTargetWrite(workspaceId: string): void {
  revalidateTag(planningTargetsTag(workspaceId));
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.calculator);
  revalidatePath(ROUTES.settingsAuditLog);
}

/** The calculator + audit log restate after a rate edit (no target-feed cache). */
function revalidateAfterRateWrite(): void {
  revalidatePath(ROUTES.calculator);
  revalidatePath(ROUTES.settingsAuditLog);
}

function readYear(formData: FormData): number | null {
  const y = Number(formData.get("year"));
  return Number.isInteger(y) ? y : null;
}

/**
 * An optional money/rate field: blank → null (use default / all-time / not
 * plannable), a valid number → its canonical decimal string (full precision, Rule 7),
 * an unparseable value → the sentinel `INVALID`. Canonical form comes from
 * parseAmountInput, which strips ₱/commas and rejects garbage.
 */
const INVALID = Symbol("invalid");
function optionalDecimal(
  formData: FormData,
  key: string
): string | null | typeof INVALID {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const parsed = parseAmountInput(raw);
  if (!parsed) return INVALID;
  return parsed.toString();
}

/** A required rate field for the funnel form → canonical decimal string or INVALID. */
function requiredDecimal(
  formData: FormData,
  key: string
): string | typeof INVALID {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return INVALID;
  const parsed = parseAmountInput(raw);
  if (!parsed) return INVALID;
  return parsed.toString();
}

/** Human-readable messages for the RPC's typed validation reasons. */
function targetReasonMessage(result: RpcResult): string {
  switch (result.reason) {
    case "invalid_year":
      return "That year is out of range. Reload the page and try again.";
    case "nit_not_positive":
      return "Enter a Net Income Target greater than zero.";
    case "opex_out_of_range":
      return "Operating Expenses % must be between 0% and 100%.";
    case "cos_out_of_range":
      return "Cost of Sales % must be between 0% and 100%.";
    case "yield_out_of_range":
      return "The yield override must be between 0% and 100%.";
    case "price_not_positive":
      return "The average price override must be greater than zero.";
    case "net_income_pct_nonpositive":
      // AC5 — the exact PRD wording.
      return "Opex % + Cost of Sales % must total less than 100%.";
    default:
      return "Could not save the planning target. Reload and try again.";
  }
}

/**
 * Set or change the PlanYearTarget for a year (FR-M3-01). NIT/opex/cos/yield/price
 * are optional (blank = use default / all-time; a blank NIT is a year staged but not
 * plannable, rule 9). Rates arrive as decimals ("0.22", not "22%") — the M3.3 form
 * converts its percent inputs before submit. Friction-gated (rule 14).
 */
export async function upsertPlanYearTarget(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const guard = await guardWorkspaceId();
  if ("error" in guard) return guard;

  const year = readYear(formData);
  if (year === null) return { error: "Which year? Reload the page and try again." };

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const nit = optionalDecimal(formData, "net_income_target");
  const opex = optionalDecimal(formData, "opex_pct");
  const cos = optionalDecimal(formData, "cos_pct");
  const yieldOverride = optionalDecimal(formData, "yield_override");
  const price = optionalDecimal(formData, "avg_price_override");

  if (nit === INVALID) return { error: "Enter a Net Income Target greater than zero, or leave it blank." };
  if (opex === INVALID) return { error: "Operating Expenses % must be a number." };
  if (cos === INVALID) return { error: "Cost of Sales % must be a number." };
  if (yieldOverride === INVALID) return { error: "The yield override must be a number." };
  if (price === INVALID) return { error: "The average price override must be a number." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_plan_year_target", {
    p_year: year,
    p_net_income_target: nit,
    p_opex_pct: opex,
    p_cos_pct: cos,
    p_yield_override: yieldOverride,
    p_avg_price_override: price,
  });

  if (error) return { error: `Could not save the planning target: ${error.message}` };

  const result = data as unknown as RpcResult;
  if (!result?.ok) return { error: targetReasonMessage(result) };

  revalidateAfterTargetWrite(guard.workspaceId);
  return { error: null, message: `Planning target for ${year} saved.` };
}

/**
 * Remove the PlanYearTarget for a year (FR-M3-01) — the year has no plan and no M6
 * target. Friction-gated + audited; a no-op when none exists.
 */
export async function deletePlanYearTarget(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const guard = await guardWorkspaceId();
  if ("error" in guard) return guard;

  const year = readYear(formData);
  if (year === null) return { error: "Which year? Reload the page and try again." };

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_plan_year_target", {
    p_year: year,
  });

  if (error) return { error: `Could not remove the planning target: ${error.message}` };

  const result = data as unknown as RpcResult;
  if (!result?.ok) return { error: "Could not remove the planning target. Reload and try again." };

  revalidateAfterTargetWrite(guard.workspaceId);
  if (!result.changed) {
    return { error: null, message: "Nothing to remove — no target was set for that year." };
  }
  return { error: null, message: `Planning target for ${year} removed.` };
}

/** The seven rate field names the funnel form submits (decimals, e.g. "0.25"). */
const RATE_FIELDS = [
  "listing_to_sold",
  "listing_appointment_rate",
  "seller_contact_to_appt",
  "seller_lead_to_contact",
  "buyer_viewing_to_atp",
  "buyer_contact_to_viewing",
  "buyer_lead_to_contact",
] as const;

const RATE_FIELD_LABELS: Record<(typeof RATE_FIELDS)[number], string> = {
  listing_to_sold: "Listing → Sold",
  listing_appointment_rate: "Listing Appointment rate",
  seller_contact_to_appt: "Seller Contact → Appointment",
  seller_lead_to_contact: "Seller Lead → Contact",
  buyer_viewing_to_atp: "Buyer Viewing → ATP",
  buyer_contact_to_viewing: "Buyer Contact → Viewing",
  buyer_lead_to_contact: "Buyer Lead → Contact",
};

/**
 * Update all seven global funnel rates (FR-M3-02). Each is required and ∈ (0,1]
 * (decimals — "0.25"). Friction-gated + audited old→new. A rate outside range is
 * refused with the offending field named (the RPC re-checks and returns a typed
 * reason).
 */
export async function updateFunnelRates(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const guard = await guardWorkspaceId();
  if ("error" in guard) return guard;

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const values: Record<string, string> = {};
  for (const field of RATE_FIELDS) {
    const parsed = requiredDecimal(formData, field);
    if (parsed === INVALID) {
      return { error: `${RATE_FIELD_LABELS[field]} must be a number between 0% and 100%.` };
    }
    values[field] = parsed;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_funnel_rates", {
    p_listing_to_sold: values.listing_to_sold,
    p_listing_appointment_rate: values.listing_appointment_rate,
    p_seller_contact_to_appt: values.seller_contact_to_appt,
    p_seller_lead_to_contact: values.seller_lead_to_contact,
    p_buyer_viewing_to_atp: values.buyer_viewing_to_atp,
    p_buyer_contact_to_viewing: values.buyer_contact_to_viewing,
    p_buyer_lead_to_contact: values.buyer_lead_to_contact,
  });

  if (error) return { error: `Could not save the funnel rates: ${error.message}` };

  const result = data as unknown as RpcResult;
  if (!result?.ok) {
    if (result?.reason === "rate_out_of_range") {
      const label =
        result.field && result.field in RATE_FIELD_LABELS
          ? RATE_FIELD_LABELS[result.field as (typeof RATE_FIELDS)[number]]
          : "A conversion rate";
      return { error: `${label} must be greater than 0% and at most 100%.` };
    }
    return { error: "Could not save the funnel rates. Reload and try again." };
  }

  revalidateAfterRateWrite();
  return { error: null, message: "Funnel rates saved." };
}
