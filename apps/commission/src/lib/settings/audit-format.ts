import { formatPHP, formatRateAsPercent } from "@/lib/money";
import { formatManilaDateTime } from "@/lib/date/manila";
import {
  DEVELOPER_COMM_BASE_LABELS,
  PROPERTY_VAT_RULE_LABELS,
  isDeveloperCommBase,
  isPropertyVatRule,
  referenceCountLabel,
} from "./lists";
import type { FieldChange, Json } from "@/types/database";

/**
 * Rendering an audit entry's old→new pair.
 *
 * THE STORED STRING IS THE RECORD. `0.1000 → 0.0500` is what the trail says and
 * what the milestone's demo script asks to see, so it is what renders — never a
 * prettified value standing in for it. The friendly reading (`10.00% → 5.00%`)
 * comes *alongside*, because "0.0500" is the truth and "5.00%" is what the agent
 * actually recognises. Showing only the second would make the log unverifiable
 * against the database; showing only the first makes the agent do arithmetic to
 * read their own history.
 */

/** Fields stored as a rate (decimal 0.1200 = 12%). */
const RATE_FIELDS = new Set(["vat_rate", "ewt_rate"]);

/** Fields stored as a peso amount. */
const AMOUNT_FIELDS = new Set(["property_vat_threshold"]);

/** Fields stored as a timestamp. `archived_at` doubles as M0.3's archive flag. */
const TIMESTAMP_FIELDS = new Set(["vat_registered_confirmed_at", "archived_at"]);

/** The exact stored value, as text. This is what the database holds. */
export function formatStoredValue(value: Json): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * The human reading of a stored value, or null when the stored value already
 * reads plainly (a workspace name needs no gloss).
 */
export function describeStoredValue(field: string, value: Json): string | null {
  if (value === null || value === undefined) return "not set";

  if (typeof value === "boolean") {
    if (field === "vat_registered") {
      return value ? "VAT-registered" : "Not VAT-registered";
    }
    return value ? "Yes" : "No";
  }

  if (typeof value === "number" && field === "chase_idle_months") {
    return `${value} month${value === 1 ? "" : "s"}`;
  }

  // M0.3's lists. The stored value is the enum's own token ("always_vat"), which
  // is the truth and is what renders; this is the word the agent chose in the UI.
  if (typeof value === "number" && field === "sort_order") {
    return `position ${value}`;
  }

  if (typeof value === "number" && field === "reference_count") {
    return referenceCountLabel(value).toLowerCase();
  }

  if (typeof value !== "string") return null;

  if (field === "vat_rule" && isPropertyVatRule(value)) {
    return PROPERTY_VAT_RULE_LABELS[value];
  }

  if (field === "comm_base" && isDeveloperCommBase(value)) {
    return DEVELOPER_COMM_BASE_LABELS[value];
  }

  // Guarded: a malformed stored value must not throw inside the audit viewer —
  // the log is where you go when something already went wrong.
  try {
    if (RATE_FIELDS.has(field)) return formatRateAsPercent(value);
    if (AMOUNT_FIELDS.has(field)) return formatPHP(value);
    if (TIMESTAMP_FIELDS.has(field)) return formatManilaDateTime(value);
  } catch {
    return null;
  }

  return null;
}

export type RenderedFieldChange = {
  /** Exact stored text, both sides. */
  oldValue: string;
  newValue: string;
  /** The friendly reading, when one adds anything. */
  oldLabel: string | null;
  newLabel: string | null;
  /**
   * old === new: this pair is CONTEXT, not a change.
   *
   * A `delete_blocked` entry records an attempt and the state that refused it —
   * the name of the item and its reference count, neither of which moved. The
   * viewer renders those as a single value, because "Condo → Condo" is not a
   * sentence about anything, and an arrow between two identical values reads as
   * a bug in the log rather than as a fact about the world.
   */
  unchanged: boolean;
};

export function renderFieldChange(
  field: string,
  change: FieldChange
): RenderedFieldChange {
  const oldValue = formatStoredValue(change.old);
  const newValue = formatStoredValue(change.new);

  return {
    oldValue,
    newValue,
    oldLabel: describeStoredValue(field, change.old),
    newLabel: describeStoredValue(field, change.new),
    unchanged: oldValue === newValue,
  };
}
