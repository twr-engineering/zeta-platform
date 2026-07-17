import { Badge } from "@/components/ui/badge";
import { formatManilaDateTime } from "@/lib/date/manila";
import {
  RECEIVABLE_ACTION_LABELS,
  RECEIVABLE_FIELD_LABELS,
  RECEIVABLE_STATUS_TRANSITION_LABELS,
} from "@/lib/receivables/labels";
import type { AuditLogEntry } from "@/types/entities";

/**
 * The receivable's status timeline (§6): creation → transitions → reopenings →
 * override changes, newest first, straight from the append-only audit log so it
 * ties to the database rather than a re-formatted approximation. The values are the
 * exact stored strings.
 */

type FieldChange = { old?: unknown; new?: unknown };

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function ReceivableTimeline({ entries }: { entries: readonly AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="receivable-timeline-empty">
        No changes recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4" data-testid="receivable-timeline">
      {entries.map((entry) => {
        const changes = (entry.field_changes ?? {}) as Record<string, FieldChange>;
        // Close/Cancel/Reopen are all logged as 'update' with a status change; give
        // them a friendlier headline (and the destructive tint on a cancel).
        const newStatus = changes.status?.new;
        const transition =
          typeof newStatus === "string"
            ? RECEIVABLE_STATUS_TRANSITION_LABELS[newStatus]
            : undefined;
        const headline = transition ?? RECEIVABLE_ACTION_LABELS[entry.action] ?? entry.action;
        return (
          <li key={entry.id} className="border-l-2 border-muted pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={newStatus === "cancelled" ? "destructive" : "secondary"}>
                {headline}
              </Badge>
              <time className="text-xs text-muted-foreground">
                {formatManilaDateTime(entry.occurred_at)}
              </time>
            </div>
            <dl className="mt-1.5 space-y-0.5 text-sm">
              {Object.entries(changes).map(([field, change]) => (
                <div key={field} className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">
                    {RECEIVABLE_FIELD_LABELS[field] ?? field}:
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
