import { Badge } from "@/components/ui/badge";
import { formatManilaDateTime } from "@/lib/date/manila";
import { DEAL_FIELD_LABELS } from "@/lib/deals/labels";
import type { AuditLogEntry } from "@/types/entities";

/**
 * A deal's own audit trail (rule 12, edge case 13) — every field-level change,
 * newest first, read from the same append-only log the global viewer reads. The
 * values are the exact stored strings so the history ties back to the database,
 * not a re-formatted approximation of it. A soft-warning override shows as a
 * `warning_override` change ("Continue anyway (audit-logged)", FR-M1-11).
 */

type FieldChange = { old?: unknown; new?: unknown };

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  archive: "Archived",
  restore: "Restored",
  delete: "Deleted",
  delete_blocked: "Delete blocked",
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function DealAuditHistory({ entries }: { entries: readonly AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="deal-audit-empty">
        No changes recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4" data-testid="deal-audit-history">
      {entries.map((entry) => {
        const changes = (entry.field_changes ?? {}) as Record<string, FieldChange>;
        return (
          <li key={entry.id} className="border-l-2 border-muted pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={entry.action === "delete" || entry.action === "delete_blocked" ? "destructive" : "secondary"}
              >
                {ACTION_LABELS[entry.action] ?? entry.action}
              </Badge>
              <time className="text-xs text-muted-foreground">
                {formatManilaDateTime(entry.occurred_at)}
              </time>
            </div>
            <dl className="mt-1.5 space-y-0.5 text-sm">
              {Object.entries(changes).map(([field, change]) => (
                <div key={field} className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">
                    {DEAL_FIELD_LABELS[field] ?? field}:
                  </dt>
                  <dd className="tabular-nums">
                    {display(change?.old)} <span className="text-muted-foreground">→</span>{" "}
                    {display(change?.new)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ol>
  );
}
