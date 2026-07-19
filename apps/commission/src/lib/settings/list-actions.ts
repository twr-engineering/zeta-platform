"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { checkConfirmation } from "@/lib/friction/gate";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";
import { countAffectedDeals } from "./recompute-queries";
import { kickoffRecompute } from "./recompute-runner";
import {
  LIST_ENTITY_LABELS,
  deleteBlockedMessage,
  endSentence,
  isDeveloperCommBase,
  isPropertyVatRule,
  parseListName,
  type ListEntity,
} from "./lists";
import {
  DEVELOPER_SEEDS,
  LEAD_SOURCE_SEEDS,
  PROPERTY_TYPE_SEEDS,
} from "./seed-lists";
import type { DeveloperCommBase, PropertyVatRule } from "@/types/entities";

/**
 * Write path for the three configuration lists (FR-M0-04/05/06).
 *
 * THE SHAPE HERE IS M0.2'S, DELIBERATELY — see ./actions and read it first.
 * Authenticate, validate, then let ONE database function do the mutation, its
 * audit entry and any recompute event in a single transaction. There is no
 * update-then-audit anywhere in this file, and there must never be: PostgREST
 * gives no transaction across two calls, and an unaudited change to a list that
 * governs VAT is exactly what rule 12 forbids.
 *
 * WHAT THE SERVER DECIDES, AND THE CLIENT ONLY SUGGESTS
 *
 *   - whether a confirmation is required (from the server's own diff, never from
 *     a flag in the payload — M0 test plan #7);
 *   - whether a delete is allowed (the reference count, and ultimately the RLS
 *     delete policy, which refuses even a forged direct DELETE);
 *   - whether a name collides (the unique index, which is the only thing that
 *     can decide it without a race).
 *
 * Every action returns ActionState rather than throwing: a refused delete and a
 * duplicate name are expected outcomes, and a 500 page is not an answer to
 * either.
 */

/** The RPC result shape shared by every list function. */
type ListResult = {
  ok: boolean;
  changed?: boolean;
  reason?: "duplicate" | "archived_duplicate" | "referenced" | "empty" | "not_empty";
  id?: string;
  name?: string;
  reference_count?: number;
  recompute_event_id?: string | null;
  created?: number;
  total?: number;
};

function notConfigured(): ActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

/**
 * Every list screen shows reference counts and archive state, the audit log
 * gains an entry, and M1's dropdowns read the same rows. Revalidating all of
 * them is cheap and keeps a stale count from becoming a wrong refusal.
 */
const LIST_ROUTES: Record<ListEntity, string> = {
  property_type: ROUTES.settingsPropertyTypes,
  developer: ROUTES.settingsDevelopers,
  lead_source: ROUTES.settingsLeadSources,
};

function revalidateList(entity: ListEntity): void {
  revalidatePath(LIST_ROUTES[entity]);
  revalidatePath(ROUTES.settingsAuditLog);
  // M10.2: the first-run wizard's seed-lists step embeds the same seed offer.
  // Revalidating /onboarding re-renders the wizard so an accepted list's offer
  // disappears (the list is no longer empty) without a manual reload.
  revalidatePath(ROUTES.onboarding);
}

/**
 * Turns a database refusal into a sentence the agent can act on.
 *
 * The 23505 case is not decoration: the functions check for a duplicate first to
 * give a better message, but only the unique index can refuse a name that two
 * requests raced to claim. That path is rare, real, and must not surface as
 * "unexpected error".
 */
function describeListError(entity: ListEntity, message: string): string {
  const label = LIST_ENTITY_LABELS[entity];

  if (message.includes("_name_unique") || message.includes("duplicate key")) {
    return `You already have a ${label} with that name. Names are matched ignoring case and spacing.`;
  }
  if (message.includes("_name_not_blank") || message.includes("needs a name")) {
    return `Give this ${label} a name.`;
  }
  if (message.includes("_name_trimmed")) {
    return "Remove the leading or trailing spaces from the name.";
  }
  if (message.includes("_name_max_len")) {
    return "That name is too long.";
  }
  if (message.includes("still referenced")) {
    return `This ${label} is used by deals and cannot be deleted. Archive it instead.`;
  }
  return `Could not save your ${label}: ${message}`;
}

/** The duplicate/archived-duplicate answers, which differ in what to do next. */
function describeDuplicate(entity: ListEntity, result: ListResult): string {
  const label = LIST_ENTITY_LABELS[entity];

  if (result.reason === "archived_duplicate") {
    return `You already have an archived ${label} called “${result.name}”. Restore it from the archived list rather than adding a second one — otherwise your reports would show the same name twice.`;
  }
  return `You already have a ${label} called “${result.name}”. Names are matched ignoring case and spacing.`;
}

async function guard(): Promise<
  { ok: true; workspaceId: string } | { ok: false; state: ActionState }
> {
  if (!isSupabaseConfigured()) return { ok: false, state: notConfigured() };

  const context = await getWorkspaceContext();
  if (!context) {
    return { ok: false, state: { error: "Your session has expired. Sign in again." } };
  }

  return { ok: true, workspaceId: context.workspace.id };
}

// --- create -----------------------------------------------------------------

export async function createPropertyType(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const parsed = parseListName("property_type", String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const rule = String(formData.get("vatRule") ?? "");
  if (!isPropertyVatRule(rule)) {
    return { error: "Choose a VAT rule for this property type." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_property_type", {
    p_name: parsed.value,
    p_vat_rule: rule as PropertyVatRule,
  });

  if (error) return { error: describeListError("property_type", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: describeDuplicate("property_type", result) };

  revalidateList("property_type");
  return { error: null, message: endSentence(`Added ${result.name}`) };
}

export async function createDeveloper(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const parsed = parseListName("developer", String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const base = String(formData.get("commBase") ?? "net");
  if (!isDeveloperCommBase(base)) {
    return { error: "Choose a commission base for this developer." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_developer", {
    p_name: parsed.value,
    p_comm_base: base as DeveloperCommBase,
  });

  if (error) return { error: describeListError("developer", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: describeDuplicate("developer", result) };

  revalidateList("developer");
  return { error: null, message: endSentence(`Added ${result.name}`) };
}

export async function createLeadSource(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const parsed = parseListName("lead_source", String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_lead_source", {
    p_name: parsed.value,
  });

  if (error) return { error: describeListError("lead_source", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: describeDuplicate("lead_source", result) };

  revalidateList("lead_source");

  // The 50-source cap is a warning, not a limit (§3.6, open question 4). It
  // rides on the success message rather than blocking the add, because the
  // agent's book is theirs and this is our opinion about M7's legibility.
  // The page renders the standing warning too; this is the moment it starts.
  return { error: null, message: endSentence(`Added ${result.name}`) };
}

// --- rename / edit ----------------------------------------------------------

/**
 * A rename never restates money (rule 6) and so is never gated. A vat_rule or
 * comm_base change does, and is — but the decision is made from the SERVER's
 * diff below, not from whether the client rendered a modal.
 */
export async function updatePropertyType(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which property type? Reload the page and try again." };

  const parsed = parseListName("property_type", String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const rule = String(formData.get("vatRule") ?? "");
  if (!isPropertyVatRule(rule)) {
    return { error: "Choose a VAT rule for this property type." };
  }

  // The gate decision, from the row as it actually is — not from the payload.
  // A request that never rendered the modal lands here identically.
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("property_type")
    .select("vat_rule")
    .eq("id", id)
    .maybeSingle<{ vat_rule: PropertyVatRule }>();

  if (readError) return { error: describeListError("property_type", readError.message) };
  if (!current) return { error: "That property type no longer exists." };

  if (current.vat_rule !== rule) {
    const confirmation = checkConfirmation(formData, { mode: "checked" });
    if (!confirmation.ok) return { error: confirmation.error };
  }

  // The honest count — the deals that reference this type (same predicate the
  // recompute drains). Only when the rule actually changed.
  const affectedDeals =
    current.vat_rule !== rule
      ? await countAffectedDeals({ entity: "property_type", propertyTypeId: id })
      : 0;

  const { data, error } = await supabase.rpc("update_property_type", {
    p_id: id,
    p_name: parsed.value,
    p_vat_rule: rule as PropertyVatRule,
    p_affected_deal_count: affectedDeals,
  });

  if (error) return { error: describeListError("property_type", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: describeDuplicate("property_type", result) };

  revalidateList("property_type");

  if (!result.changed) {
    return { error: null, message: "Nothing changed — it is as it was." };
  }

  return listSavedMessage(result);
}

export async function updateDeveloper(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which developer? Reload the page and try again." };

  const parsed = parseListName("developer", String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const base = String(formData.get("commBase") ?? "");
  if (!isDeveloperCommBase(base)) {
    return { error: "Choose a commission base for this developer." };
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("developer")
    .select("comm_base")
    .eq("id", id)
    .maybeSingle<{ comm_base: DeveloperCommBase }>();

  if (readError) return { error: describeListError("developer", readError.message) };
  if (!current) return { error: "That developer no longer exists." };

  // Rule 8, and the only gate on this screen that the PRD names outright.
  if (current.comm_base !== base) {
    const confirmation = checkConfirmation(formData, { mode: "checked" });
    if (!confirmation.ok) return { error: confirmation.error };
  }

  const affectedDeals =
    current.comm_base !== base
      ? await countAffectedDeals({ entity: "developer", developerId: id })
      : 0;

  const { data, error } = await supabase.rpc("update_developer", {
    p_id: id,
    p_name: parsed.value,
    p_comm_base: base as DeveloperCommBase,
    p_affected_deal_count: affectedDeals,
  });

  if (error) return { error: describeListError("developer", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: describeDuplicate("developer", result) };

  revalidateList("developer");

  if (!result.changed) {
    return { error: null, message: "Nothing changed — it is as it was." };
  }

  return listSavedMessage(result);
}

/**
 * The saved-message tail shared by the two restating list updates: if the change
 * queued a recompute, drain it now (FR-M1-07) and report the restated count. The
 * change already committed with its durable event, so a drain failure only means
 * the recompute banner will resume it — the save still succeeded.
 */
async function listSavedMessage(result: ListResult): Promise<ActionState> {
  if (!result.recompute_event_id) {
    return { error: null, message: `${endSentence(`Saved ${result.name}`)} Recorded in your audit log.` };
  }

  const recompute = await kickoffRecompute(result.recompute_event_id);
  return {
    error: null,
    message:
      recompute.status === "completed"
        ? `${endSentence(`Saved ${result.name}`)} ${recompute.restated} ${recompute.restated === 1 ? "deal" : "deals"} restated and recorded in your audit log.`
        : `${endSentence(`Saved ${result.name}`)} Restating your deals is in progress — see the recompute banner. Recorded in your audit log.`,
  };
}

export async function updateLeadSource(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which lead source? Reload the page and try again." };

  const parsed = parseListName("lead_source", String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_lead_source", {
    p_id: id,
    p_name: parsed.value,
  });

  if (error) return { error: describeListError("lead_source", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: describeDuplicate("lead_source", result) };

  revalidateList("lead_source");

  if (!result.changed) {
    return { error: null, message: "Nothing changed — it is as it was." };
  }

  // AC6: the rename propagates by id, so every deal shows the new name and M7
  // aggregates them under one row. Nothing to recompute, nothing to confirm.
  return { error: null, message: endSentence(`Renamed to ${result.name}`) };
}

// --- archive / restore ------------------------------------------------------

/**
 * Not friction-gated, deliberately (rule 9). Archiving is reversible in one
 * click and destroys nothing: the item leaves new-deal dropdowns and every
 * existing deal keeps displaying and computing exactly as before. A confirmation
 * on a reversible toggle is how agents learn to click through confirmations.
 */
async function setArchived(
  entity: ListEntity,
  rpc: "set_property_type_archived" | "set_developer_archived" | "set_lead_source_archived",
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Reload the page and try again." };

  const archived = String(formData.get("archived") ?? "") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, { p_id: id, p_archived: archived });

  if (error) return { error: describeListError(entity, error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: `Could not update that ${LIST_ENTITY_LABELS[entity]}.` };

  revalidateList(entity);

  if (!result.changed) {
    return { error: null, message: "Nothing changed — it is as it was." };
  }

  return {
    error: null,
    message: archived
      ? `${endSentence(`Archived ${result.name}`)} It is gone from new-deal dropdowns; existing deals are untouched.`
      : `${endSentence(`Restored ${result.name}`)} It is back in the dropdowns.`,
  };
}

export async function archivePropertyType(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return setArchived("property_type", "set_property_type_archived", formData);
}

export async function archiveDeveloper(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return setArchived("developer", "set_developer_archived", formData);
}

export async function archiveLeadSource(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return setArchived("lead_source", "set_lead_source_archived", formData);
}

// --- delete (rule 5, AC4) ---------------------------------------------------

/**
 * Gated `checked`, not `typed`.
 *
 * gate.ts draws the line at reversibility: `typed` is for irreversible acts
 * (delete the account, write off a receivable), `checked` for serious but
 * recoverable ones. A hard delete here is only ever permitted at reference count
 * zero — nothing depends on the row, and re-adding it is retyping a name. Making
 * an agent type "Condo" to remove an unused list item they added by mistake
 * would be ceremony, and ceremony is what teaches people to stop reading gates.
 *
 * The gate is not what protects referenced items. The RLS delete policy is: a
 * forged direct DELETE of a referenced row matches nothing.
 */
async function deleteItem(
  entity: ListEntity,
  rpc: "delete_property_type" | "delete_developer" | "delete_lead_source",
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Reload the page and try again." };

  const confirmation = checkConfirmation(formData, { mode: "checked" });
  if (!confirmation.ok) return { error: confirmation.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, { p_id: id });

  if (error) return { error: describeListError(entity, error.message) };

  const result = data as unknown as ListResult;

  // A refusal is a value, not an exception: the function wrote a delete_blocked
  // audit entry in the same transaction, and raising would have rolled that
  // entry back along with the record of the attempt.
  if (!result?.ok) {
    if (result?.reason === "referenced") {
      // The blocked attempt is now in the trail, so the audit log must reflect it.
      revalidateList(entity);
      return {
        error: deleteBlockedMessage(
          entity,
          result.name ?? "This item",
          result.reference_count ?? 0
        ),
      };
    }
    return { error: `Could not delete that ${LIST_ENTITY_LABELS[entity]}.` };
  }

  revalidateList(entity);
  return { error: null, message: endSentence(`Deleted ${result.name}`) };
}

export async function deletePropertyType(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return deleteItem("property_type", "delete_property_type", formData);
}

export async function deleteDeveloper(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return deleteItem("developer", "delete_developer", formData);
}

export async function deleteLeadSource(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return deleteItem("lead_source", "delete_lead_source", formData);
}

// --- reorder (§3.6) ---------------------------------------------------------

export async function reorderLeadSource(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const id = String(formData.get("id") ?? "");
  const position = Number(formData.get("position"));

  if (!id || !Number.isInteger(position)) {
    return { error: "Reload the page and try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reorder_lead_source", {
    p_id: id,
    p_position: position,
  });

  if (error) return { error: describeListError("lead_source", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: "Could not reorder your lead sources." };

  revalidateList("lead_source");
  return { error: null, message: result.changed ? "Order saved." : "" };
}

// --- the seed offer (rule 11) -----------------------------------------------

/**
 * Accepting the workbook's example list — the "accept" and "edit" of "accept,
 * edit, or skip". The agent's selection arrives as the names they left ticked;
 * anything they unticked simply never reaches the database.
 *
 * The offer's CONTENT is matched against ./seed-lists here rather than trusted
 * from the payload. The client sends which rows were accepted, not what those
 * rows contain — otherwise the "offer" would be a form through which any
 * vat_rule could be posted under a workbook name, and the provenance the UI
 * claims ("these come from the v30.20 workbook") would stop being true.
 */
export async function acceptPropertyTypeSeeds(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const chosen = new Set(formData.getAll("seed").map(String));
  const items = PROPERTY_TYPE_SEEDS.filter((seed) => chosen.has(seed.name));

  if (items.length === 0) {
    return { error: "Tick at least one property type, or skip the offer." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seed_property_types", {
    p_items: items,
  });

  if (error) return { error: describeListError("property_type", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: seedRefusal("property_type", result) };

  revalidateList("property_type");
  return {
    error: null,
    message: `Added ${result.created} property types. Every one of them is yours to rename, archive or delete.`,
  };
}

export async function acceptDeveloperSeeds(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const chosen = new Set(formData.getAll("seed").map(String));
  const items = DEVELOPER_SEEDS.filter((seed) => chosen.has(seed.name));

  if (items.length === 0) {
    return { error: "Tick at least one developer, or skip the offer." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seed_developers", { p_items: items });

  if (error) return { error: describeListError("developer", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: seedRefusal("developer", result) };

  revalidateList("developer");
  return {
    error: null,
    message: `Added ${result.created} developers. Check each one's commission base against your own agreement — the workbook's answer is not necessarily yours.`,
  };
}

export async function acceptLeadSourceSeeds(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const g = await guard();
  if (!g.ok) return g.state;

  const chosen = new Set(formData.getAll("seed").map(String));
  const items = LEAD_SOURCE_SEEDS.filter((seed) => chosen.has(seed.name));

  if (items.length === 0) {
    return { error: "Tick at least one lead source, or skip the offer." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seed_lead_sources", { p_items: items });

  if (error) return { error: describeListError("lead_source", error.message) };

  const result = data as unknown as ListResult;
  if (!result?.ok) return { error: seedRefusal("lead_source", result) };

  revalidateList("lead_source");
  return {
    error: null,
    message: `Added ${result.created} lead sources, in the order shown. Drag them into the order you want.`,
  };
}

/**
 * `not_empty` is the idempotency guard doing its job — a double-click, a retry
 * after a flaky connection, or M10 re-running its wizard. It is not really an
 * error, so it does not read as one.
 */
function seedRefusal(entity: ListEntity, result: ListResult): string {
  if (result?.reason === "not_empty") {
    return `Your ${LIST_ENTITY_LABELS[entity]} list already has items in it, so the starter list was not added again. Add what you need with the form above.`;
  }
  return `Nothing was selected to add.`;
}
