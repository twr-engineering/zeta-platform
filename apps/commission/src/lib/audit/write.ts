import { createClient } from "@/lib/supabase/server";
import type { Enums, FieldChanges, Json } from "@/types/database";

/**
 * The audit hook (M0.1 deliverable; table defined in M0 §3.7).
 *
 * M0 rule 12: *every* settings edit is audit-logged with old→new values. The
 * log's value is what changed when — self-audit, support, and BIR-defensibility.
 *
 * SCOPE — this is the hook, not the finished write path. M0.2 owns the durable
 * write path and the filterable viewer (FR-M0-08), and inherits one known
 * limitation it should close:
 *
 *   PostgREST gives no transaction across two calls, so a caller updates the row
 *   and then writes the entry. If the entry insert fails, the change has already
 *   landed and is now unaudited — which rule 12 forbids. `writeAuditEntry`
 *   therefore reports failure loudly (never swallows it) and callers surface it,
 *   so the gap is visible rather than silent. The fix is to make the pair atomic
 *   — either a SECURITY INVOKER function per mutation (RLS still applies), or a
 *   generic table trigger — and that choice belongs to M0.2, which has all four
 *   settings entities in front of it. Do not build more callers on the
 *   two-call pattern than M0.1's single rename.
 */

export type AuditAction = Enums<"audit_action">;

export type AuditEntryInput = {
  workspaceId: string;
  /**
   * Must be the acting user. RLS rejects any other value (`actor_user_id =
   * auth.uid()`), so a forged actor fails at the database rather than here.
   */
  actorUserId: string;
  /** Lowercase singular, matching the table name: "workspace", "tax_settings". */
  entityType: string;
  entityId: string;
  action: AuditAction;
  fieldChanges?: FieldChanges;
};

export async function writeAuditEntry(input: AuditEntryInput): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("audit_log_entry").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    field_changes: (input.fieldChanges ?? {}) as Json,
  });

  // Deliberately thrown, not returned. An unaudited financial change is worse
  // than a visible failure, and the caller cannot meaningfully continue.
  if (error) {
    throw new Error(`Audit entry could not be written: ${error.message}`);
  }
}

/**
 * Builds the old→new diff for the fields that actually changed.
 *
 * Decimals arrive as strings (`::text` selects — see @/lib/supabase/selects) and
 * are recorded as strings: a JSON number is a binary float, and the trail has to
 * reproduce the persisted decimal exactly (Master PRD §4.3). Comparison is
 * therefore string equality, which for an exact decimal is what you want —
 * "0.1000" and "0.10" are the same rate but not the same stored value, and the
 * trail records what was stored.
 */
export function diffFields<T extends Record<string, Json>>(
  before: T,
  after: Partial<T>
): FieldChanges {
  const changes: FieldChanges = {};

  for (const key of Object.keys(after)) {
    const next = after[key];
    if (next === undefined) continue;

    const previous = before[key];
    if (previous === next) continue;

    changes[key] = { old: previous ?? null, new: next };
  }

  return changes;
}
