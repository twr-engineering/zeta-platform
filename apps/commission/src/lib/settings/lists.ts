import type { DeveloperCommBase, PropertyVatRule } from "@/types/entities";

/**
 * The three configuration lists, described once (M0 §3.4–3.6).
 *
 * Pure — no database, no `server-only` — because the same rules have to run in
 * three places and disagreeing in any of them is a bug:
 *
 *   1. the list UI, to disable a Save the server would reject;
 *   2. the server action, which is the enforcement;
 *   3. the unit tests, which pin the rules to the PRD's words.
 *
 * The SQL mirrors what it must (uniqueness, trim, ranges) because a forged
 * request never runs any of this — see 20260717210100_m03_configuration_lists.
 */

export type ListEntity = "property_type" | "developer" | "lead_source";

export const LIST_ENTITIES: readonly ListEntity[] = [
  "property_type",
  "developer",
  "lead_source",
];

/** Singular, for messages: "This developer is used by 3 deals." */
export const LIST_ENTITY_LABELS: Record<ListEntity, string> = {
  property_type: "property type",
  developer: "developer",
  lead_source: "lead source",
};

export const LIST_ENTITY_TITLES: Record<ListEntity, string> = {
  property_type: "Property Types",
  developer: "Developers",
  lead_source: "Lead Sources",
};

/** §3.4/§3.5/§3.6 declare string(80)/string(120)/string(80); the CHECK constraints mirror these. */
export const NAME_MAX_LENGTH: Record<ListEntity, number> = {
  property_type: 80,
  developer: 120,
  lead_source: 80,
};

// --- vat_rule (§3.4) --------------------------------------------------------

export const PROPERTY_VAT_RULES: readonly PropertyVatRule[] = [
  "threshold",
  "always_vat",
  "always_exempt",
];

export const PROPERTY_VAT_RULE_LABELS: Record<PropertyVatRule, string> = {
  threshold: "Threshold",
  always_vat: "Always VAT",
  always_exempt: "Always Exempt",
};

/**
 * The sheet's own wording, kept: this screen replaces a spreadsheet the agent
 * already knows how to read, and renaming its concepts makes them relearn it.
 */
export const PROPERTY_VAT_RULE_CAPTIONS: Record<PropertyVatRule, string> = {
  threshold:
    "Exempt at or below your VAT threshold, VAT-able strictly above it. Exactly the threshold is exempt.",
  always_vat: "VAT-able whatever the list price.",
  always_exempt: "Never VAT-able, whatever the list price.",
};

export function isPropertyVatRule(value: string): value is PropertyVatRule {
  return (PROPERTY_VAT_RULES as readonly string[]).includes(value);
}

// --- comm_base (§3.5) -------------------------------------------------------

export const DEVELOPER_COMM_BASES: readonly DeveloperCommBase[] = ["gross", "net"];

export const DEVELOPER_COMM_BASE_LABELS: Record<DeveloperCommBase, string> = {
  gross: "Gross",
  net: "Net",
};

export const DEVELOPER_COMM_BASE_CAPTIONS: Record<DeveloperCommBase, string> = {
  gross: "Your rate applies to the gross TCP — the full list price, VAT included.",
  net: "Your rate applies to the net-of-VAT price. This is the usual arrangement.",
};

export function isDeveloperCommBase(value: string): value is DeveloperCommBase {
  return (DEVELOPER_COMM_BASES as readonly string[]).includes(value);
}

// --- names (rule 7) ---------------------------------------------------------

export type NameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Rule 7: "Uniqueness is case-insensitive, trimmed." The trim happens here and
 * again in SQL — uniqueness itself is the unique index's job, because only the
 * database can decide it without a race.
 */
export function parseListName(entity: ListEntity, raw: string): NameResult {
  const value = raw.trim();

  if (value === "") {
    return { ok: false, error: `Give this ${LIST_ENTITY_LABELS[entity]} a name.` };
  }

  const max = NAME_MAX_LENGTH[entity];
  if (value.length > max) {
    return { ok: false, error: `Keep the name to ${max} characters or fewer.` };
  }

  return { ok: true, value };
}

/** Rule 7's own example: "megaworld geri " and "Megaworld GERI" are the same name. */
export function namesCollide(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

// --- the 50-source soft cap (§3.6; PRD open question 4) ---------------------

/**
 * "The sheet caps at 50 sources; the SaaS needs no hard cap but M7's report
 * should stay legible — soft-warn beyond 50."
 *
 * A warning, never a refusal (open question 4: "keep as a warning only?" —
 * answered yes, and recorded in progress.txt). The agent's book is theirs; this
 * says what will get ugly and then gets out of the way.
 */
export const LEAD_SOURCE_SOFT_CAP = 50;

export function leadSourceCapWarning(total: number): string | null {
  if (total <= LEAD_SOURCE_SOFT_CAP) return null;
  return `You have ${total} lead sources. Past ${LEAD_SOURCE_SOFT_CAP}, the Source Performance report gets hard to read — nothing is blocked, but consider archiving the ones you no longer use.`;
}

// --- what restates money (rule 3 / rule 8) ----------------------------------

/**
 * THE AUTHORITATIVE LIST, mirrored in SQL by update_property_type and
 * update_developer. Changing it means changing both.
 *
 * `comm_base` is rule 8, verbatim: it "recomputes that developer's deals (with
 * rule-3 confirmation)".
 *
 * `vat_rule` is NOT named by any rule — a deliberate extension, flagged in
 * progress.txt. It decides whether a deal's list price is VAT-able at all, which
 * moves Net List Price and therefore GCI: the same restatement rule 8 describes,
 * by a different route. Treating it as cosmetic because rule 8 happened to name
 * only the developer field would silently restate booked money, which is the one
 * thing rule 3 exists to prevent.
 *
 * A RENAME IS ABSENT ON PURPOSE. Rule 6: deals store FK ids, so renaming moves
 * no number — it propagates to every display and M7 aggregates it under one row.
 * Gating it would train the agent to click through confirmations, which is how
 * the gate stops working on the day it matters (see @/lib/friction/gate).
 */
export const LIST_MONEY_RESTATING_FIELDS: Record<ListEntity, readonly string[]> = {
  property_type: ["vat_rule"],
  developer: ["comm_base"],
  lead_source: [],
};

export function listRequiresConfirmation(
  entity: ListEntity,
  changedFields: readonly string[]
): boolean {
  const restating = LIST_MONEY_RESTATING_FIELDS[entity];
  return changedFields.some((field) => restating.includes(field));
}

/**
 * The consequence line for a list restatement (M0 §6's shape: "This will
 * recompute N deals — booked GCI figures will change. Continue?").
 *
 * Mirrors recomputeConsequence() in ./recompute, including its zero case: with
 * no deals, the PRD's sentence would be a lie dressed as a warning. Kept
 * separate rather than shared because the two speak about different things — a
 * rate change hits every deal, a comm_base change hits one developer's — and
 * collapsing them into one parameterised sentence would make both vaguer.
 */
export function listRecomputeConsequence(
  entity: ListEntity,
  name: string,
  affectedDeals: number
): string {
  const what =
    entity === "developer"
      ? `how commission is calculated for every deal booked against ${name}`
      : `whether deals of type ${name} are VAT-able`;

  if (affectedDeals === 0) {
    return `Changing this restates money: it changes ${what}. You have no deals yet, so nothing is recomputed now — this applies to every deal you enter from here on.`;
  }

  return `This will recompute ${affectedDeals} ${
    affectedDeals === 1 ? "deal" : "deals"
  } — it changes ${what}, so booked GCI figures will change. Your logged payments keep the splits they were recorded with.`;
}

// --- archive / delete copy (rule 5, AC4) ------------------------------------

/**
 * Ends a sentence that finishes with a name the agent chose.
 *
 * "Abrown Inc." is the workbook's own developer and the milestone's demo script,
 * and `Added ${name}.` renders it "Added Abrown Inc..". Real names end in
 * punctuation — "Inc.", "Co.", "J.R." — so anything echoing a name back needs
 * this rather than a bare period.
 */
export function endSentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text : `${text}.`;
}

export function referenceCountLabel(count: number): string {
  if (count === 0) return "Not used yet";
  return `Used by ${count} ${count === 1 ? "deal" : "deals"}`;
}

/**
 * AC4: a referenced item's delete "is blocked with the reference count and
 * Archive is offered". The sheet's silent fallback (missing type → Always-VAT,
 * flagged only afterwards in Data Health) is exactly what rule 5 replaces with
 * prevention, so this sentence has to explain, not just refuse.
 */
export function deleteBlockedMessage(
  entity: ListEntity,
  name: string,
  count: number
): string {
  return `${name} is used by ${count} ${
    count === 1 ? "deal" : "deals"
  }, so it cannot be deleted — those deals would lose the ${
    LIST_ENTITY_LABELS[entity]
  } they were computed with. Archive it instead: it leaves the dropdown for new deals, and every existing deal keeps displaying and computing exactly as it does now.`;
}
