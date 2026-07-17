import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/lib/routes";
import { formatManilaDateTime } from "@/lib/date/manila";
import { renderFieldChange } from "@/lib/settings/audit-format";
import { DEAL_FIELD_LABELS } from "@/lib/deals/labels";
import { TAX_FIELD_LABELS } from "@/lib/settings/tax";
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  AUDIT_PAGE_SIZE,
  isAuditEntityType,
  isCivilDate,
  listAuditEntries,
  type AuditFilters,
} from "@/lib/settings/audit-queries";
import type { AuditLogEntry } from "@/types/entities";

export const metadata: Metadata = { title: "Audit Log" };

/**
 * The audit log viewer (FR-M0-08, M0 §3.7).
 *
 * Filters live in the URL and the form is a plain GET, so filtering works
 * before React hydrates, survives a reload, and can be linked to — the log is
 * the screen an agent reaches for when they are already confused about what
 * happened, and it should be the least clever one in the product.
 */

type PageProps = {
  searchParams: Promise<{ entity?: string; from?: string; to?: string }>;
};

export default async function AuditLogSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Anything unrecognised is dropped rather than argued with: an unparseable
  // filter should show the unfiltered log, not an error page.
  const filters: AuditFilters = {
    entityType:
      params.entity && isAuditEntityType(params.entity)
        ? params.entity
        : undefined,
    from: params.from && isCivilDate(params.from) ? params.from : undefined,
    to: params.to && isCivilDate(params.to) ? params.to : undefined,
  };

  const { entries, truncated } = await listAuditEntries(filters);
  const filtered = Boolean(filters.entityType || filters.from || filters.to);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
          <CardDescription>
            Every settings change, with its old and new value — so you can answer
            &ldquo;when did I switch my EWT to 5%?&rdquo; months from now, for
            your own peace of mind, for support, and if the BIR ever asks.
            Entries can never be edited or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditFilterForm filters={filters} />
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={filtered ? "No changes match these filters" : "No changes recorded yet"}
          description={
            filtered
              ? "Nothing was changed in this range. Widen the dates or clear the entity filter."
              : "Your settings are exactly as your account was created with. The moment you change one — a tax rate, your workspace name — it appears here with its old and new value."
          }
          action={
            filtered ? (
              // nativeButton={false}: this renders an <a>, and Base UI warns
              // (rightly) that a non-<button> loses native button semantics.
              // It is a link — it navigates — so the fix is to say so, not to
              // silence it.
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href={ROUTES.settingsAuditLog} />}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3" data-testid="audit-entries">
          {truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the {AUDIT_PAGE_SIZE} most recent changes. Narrow the dates
              to see further back.
            </p>
          )}
          {entries.map((entry) => (
            <AuditEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A GET form — no server action, no client state. The URL is the filter.
 */
function AuditFilterForm({ filters }: { filters: AuditFilters }) {
  return (
    <form
      method="get"
      action={ROUTES.settingsAuditLog}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      data-testid="audit-filter-form"
    >
      <div className="space-y-1.5">
        <Label htmlFor="entity">Entity</Label>
        <select
          id="entity"
          name="entity"
          defaultValue={filters.entityType ?? ""}
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
          data-testid="audit-entity-filter"
        >
          <option value="">All entities</option>
          {AUDIT_ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {AUDIT_ENTITY_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="from">From</Label>
        <input
          id="from"
          name="from"
          type="date"
          defaultValue={filters.from ?? ""}
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
          data-testid="audit-from-filter"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="to">To</Label>
        <input
          id="to"
          name="to"
          type="date"
          defaultValue={filters.to ?? ""}
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
          data-testid="audit-to-filter"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" data-testid="audit-filter-apply">
          Apply
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={ROUTES.settingsAuditLog} />}
          data-testid="audit-filter-clear"
        >
          Clear
        </Button>
      </div>
    </form>
  );
}

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Changed",
  archive: "Archived",
  restore: "Restored",
  delete: "Deleted",
  delete_blocked: "Delete blocked",
};

/**
 * The two actions that are not ordinary edits get the eye drawn to them: a hard
 * delete is the only irreversible thing on these screens, and a blocked delete
 * is an attempt against referenced financial data. Everything else is a change,
 * and shouting about all of them would be the same as shouting about none.
 */
const LOUD_ACTIONS = new Set(["delete", "delete_blocked"]);

/**
 * A card per entry rather than a table row: the whole product is used from a
 * phone (M0 §6), and a 5-column table at 360px is a table nobody reads.
 */
function AuditEntryCard({ entry }: { entry: AuditLogEntry }) {
  const entityLabel = isAuditEntityType(entry.entity_type)
    ? AUDIT_ENTITY_LABELS[entry.entity_type]
    : entry.entity_type;

  const changes = Object.entries(entry.field_changes ?? {});

  return (
    <Card data-testid="audit-entry">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="secondary">{entityLabel}</Badge>
          <span
            className={
              LOUD_ACTIONS.has(entry.action)
                ? "text-sm font-medium text-destructive"
                : "text-sm font-medium"
            }
            data-testid="audit-action"
          >
            {ACTION_LABELS[entry.action] ?? entry.action}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatManilaDateTime(entry.occurred_at)}
          </span>
        </div>

        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No field-level detail was recorded for this entry.
          </p>
        ) : (
          <dl className="space-y-2">
            {changes.map(([field, change]) => {
              const rendered = renderFieldChange(field, change);
              const label =
                field in TAX_FIELD_LABELS
                  ? TAX_FIELD_LABELS[field as keyof typeof TAX_FIELD_LABELS]
                  : FIELD_LABELS[field] ?? field;

              return (
                <div key={field} className="space-y-0.5" data-testid="audit-change">
                  <dt className="text-xs font-medium text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    {rendered.unchanged ? (
                      // Context, not a change — see RenderedFieldChange.unchanged.
                      // A blocked delete's "Condo → Condo" is noise; the value
                      // alone is the fact.
                      <>
                        <span
                          className="font-mono font-medium tabular-nums"
                          data-testid="audit-context"
                        >
                          {rendered.newValue}
                        </span>
                        {rendered.newLabel && (
                          <span className="text-xs text-muted-foreground">
                            ({rendered.newLabel})
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {/* The stored strings — what the database actually holds. */}
                        <span
                          className="font-mono tabular-nums"
                          data-testid="audit-old"
                        >
                          {rendered.oldValue}
                        </span>
                        <span aria-hidden="true" className="text-muted-foreground">
                          →
                        </span>
                        <span
                          className="font-mono font-medium tabular-nums"
                          data-testid="audit-new"
                        >
                          {rendered.newValue}
                        </span>
                        {/* BOTH sides, or neither. A gloss is a second reading
                            of the same change, and half a reading is worse than
                            none: a delete stores name "Lamudi" → null, and only
                            the null side has a plain-language form, so this used
                            to render the jarring "(— → not set)" next to a line
                            that already said "Lamudi → —". */}
                        {rendered.oldLabel && rendered.newLabel && (
                          <span className="text-xs text-muted-foreground">
                            ({rendered.oldLabel} → {rendered.newLabel})
                          </span>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Labels for fields outside tax settings — the workspace name, and M0.3's three
 * lists. Without an entry here a field renders as its raw column name, which is
 * how an audit log stops being readable one migration at a time. M1/M4/M5 extend
 * this as they start writing their own entries.
 */
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  vat_rule: "VAT rule",
  comm_base: "Commission base",
  sort_order: "Order",
  archived_at: "Archived",
  reference_count: "Used by",
  // M0.4 account events.
  display_name: "Display name",
  email: "Email",
  password: "Password",
  // M1.3 deal events — the full field set lives in the deals label module.
  ...DEAL_FIELD_LABELS,
  // M4.1 receivable events (the two editable fields M4.1 owns).
  confirmed_collectible: "Confirmed Collectible",
  next_action_note: "Next Action",
};
