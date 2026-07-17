import { createClient } from "@/lib/supabase/server";
import { AUDIT_LOG_SELECT } from "@/lib/supabase/selects";
import { manilaDayEnd, manilaDayStart } from "@/lib/date/manila";
import type { AuditLogEntry } from "@/types/entities";

/**
 * Reads for the audit log viewer (FR-M0-08: "every settings/list mutation
 * appears in a per-workspace audit log view (filter by entity, date)").
 *
 * Not cached, deliberately — unlike the settings row next door. This is an
 * append-only trail an agent opens to answer "what did I change, and when";
 * serving that from a five-minute cache would show them a log missing the
 * change they just made, which is the one question they are here to ask.
 */

/**
 * Entity types the viewer can filter by.
 *
 * A closed list, matched against `entity_type` — which is free text in the
 * table, because M1/M4/M5 write their own entity types and M0 cannot enumerate
 * them. M0.3 adds property_type, developer and lead_source here as it starts
 * writing them.
 */
export const AUDIT_ENTITY_TYPES = [
  "tax_settings",
  "property_type",
  "developer",
  "lead_source",
  "workspace",
  "profile",
  "account",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  tax_settings: "Tax Settings",
  property_type: "Property Types",
  developer: "Developers",
  lead_source: "Lead Sources",
  workspace: "Workspace",
  // M0.4: the display name lives on the profile; email and password are
  // auth-level events grouped under "Account".
  profile: "Account",
  account: "Account",
};

export type AuditFilters = {
  /** undefined = every entity type. */
  entityType?: AuditEntityType;
  /** Manila civil dates (YYYY-MM-DD), both inclusive. */
  from?: string;
  to?: string;
};

/**
 * One page more than we display, so the viewer can say "showing the most recent
 * 100" honestly instead of implying the trail ends there. M9 owns real search
 * and pagination across the product; this stays a viewer.
 */
export const AUDIT_PAGE_SIZE = 100;

export type AuditPage = {
  entries: AuditLogEntry[];
  /** True when the filter matched more than a page — the view is not the whole story. */
  truncated: boolean;
};

export function isAuditEntityType(value: string): value is AuditEntityType {
  return (AUDIT_ENTITY_TYPES as readonly string[]).includes(value);
}

/** A civil date as the form's date input produces it. */
export function isCivilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function listAuditEntries(
  filters: AuditFilters = {}
): Promise<AuditPage> {
  const supabase = await createClient();

  // No workspace_id filter: RLS scopes the trail to the caller's workspace
  // (M0 rule 1, and proven live — B cannot read A's entries). The
  // (workspace_id, occurred_at desc) index backs this ordering.
  let query = supabase
    .from("audit_log_entry")
    .select(AUDIT_LOG_SELECT)
    .order("occurred_at", { ascending: false })
    .limit(AUDIT_PAGE_SIZE + 1);

  if (filters.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }

  // Manila civil days, not UTC — an agent filtering "17 July" means their day.
  if (filters.from && isCivilDate(filters.from)) {
    query = query.gte("occurred_at", manilaDayStart(filters.from));
  }
  if (filters.to && isCivilDate(filters.to)) {
    query = query.lte("occurred_at", manilaDayEnd(filters.to));
  }

  const { data, error } = await query.returns<AuditLogEntry[]>();

  if (error) {
    throw new Error(`Could not read the audit log: ${error.message}`);
  }

  const rows = data ?? [];

  return {
    entries: rows.slice(0, AUDIT_PAGE_SIZE),
    truncated: rows.length > AUDIT_PAGE_SIZE,
  };
}
