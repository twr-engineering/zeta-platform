import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  AUDIT_LOG_SELECT,
  PROFILES_SELECT,
  SETTINGS_CHANGE_EVENT_SELECT,
  TAX_SETTINGS_SELECT,
  WORKSPACE_SELECT,
} from "@/lib/supabase/selects";
import {
  DEVELOPER_COMM_BASE_LABELS,
  PROPERTY_VAT_RULE_LABELS,
} from "@/lib/settings/lists";
import {
  listDevelopers,
  listLeadSources,
  listPropertyTypes,
} from "@/lib/settings/list-queries";
import { listDeals } from "@/lib/deals/queries";
import {
  listReceivables,
  receivablePayor,
  type ReceivableRow,
} from "@/lib/receivables/queries";
import { listPayments, type PaymentRow } from "@/lib/payments/queries";
import type { ExportColumn, ExportDataset } from "./format";
import type {
  AuditLogEntry,
  Deal,
  Developer,
  LeadSource,
  Membership,
  Profile,
  PropertyType,
  SettingsChangeEvent,
  TaxSettings,
  Workspace,
} from "@/types/entities";
import type { WithReferenceCount } from "@/lib/settings/list-queries";

/**
 * The export registry (FR-M0-09: per-list CSV/XLSX; FR-M0-10: the whole
 * workspace as one archive).
 *
 * A dataset is a name, its columns, and a loader. The route handlers know
 * nothing else, so a new export is a new entry here — not a new endpoint, a new
 * CSV writer, and a new set of auth mistakes.
 *
 * THE LOADER IS THE SAME QUERY THE SCREEN USES wherever a screen exists (AC8:
 * the download must match "the on-screen rows"). The whole-workspace tables that
 * have no screen — the workspace row, the profile, the full audit trail — read
 * their own rows here, RLS-scoped exactly as everything else in the app, with
 * NO workspace_id parameter: RLS is the tenant boundary (see the route handler).
 */

/** Shown as "Archived"/"Active" rather than a timestamp the reader must decode. */
function archivedState(row: { archived_at: string | null }): string {
  return row.archived_at ? "Archived" : "Active";
}

/**
 * Erases the per-column Row generic at the boundary. Each dataset is internally
 * consistent (its columns read its rows); the registry holds a heterogeneous
 * list, and format.ts is generic over Row, so an opaque row type is exactly
 * right here — mirrors the existing `as unknown` idiom.
 */
function dataset<Row>(d: {
  name: string;
  sheet: string;
  columns: readonly ExportColumn<Row>[];
  rows: readonly Row[];
}): ExportDataset<unknown> {
  return d as unknown as ExportDataset<unknown>;
}

// --- the three configuration lists (FR-M0-09) -------------------------------

const PROPERTY_TYPE_COLUMNS: readonly ExportColumn<
  WithReferenceCount<PropertyType>
>[] = [
  { header: "Property Type", type: "text", value: (r) => r.name, width: 26 },
  {
    header: "VAT Rule",
    type: "text",
    // The label, not the enum token: this file is for the agent, and the audit
    // log is where the stored value is the point.
    value: (r) => PROPERTY_VAT_RULE_LABELS[r.vat_rule],
    width: 16,
  },
  { header: "Status", type: "text", value: archivedState, width: 12 },
  { header: "Used by (deals)", type: "number", value: (r) => r.reference_count, width: 16 },
  { header: "Archived at", type: "date", value: (r) => r.archived_at, width: 20 },
];

const DEVELOPER_COLUMNS: readonly ExportColumn<WithReferenceCount<Developer>>[] = [
  { header: "Developer", type: "text", value: (r) => r.name, width: 30 },
  {
    header: "Commission Base",
    type: "text",
    value: (r) => DEVELOPER_COMM_BASE_LABELS[r.comm_base],
    width: 18,
  },
  { header: "Status", type: "text", value: archivedState, width: 12 },
  { header: "Used by (deals)", type: "number", value: (r) => r.reference_count, width: 16 },
  { header: "Archived at", type: "date", value: (r) => r.archived_at, width: 20 },
];

const LEAD_SOURCE_COLUMNS: readonly ExportColumn<WithReferenceCount<LeadSource>>[] = [
  { header: "Order", type: "number", value: (r) => r.sort_order, width: 8 },
  { header: "Lead Source", type: "text", value: (r) => r.name, width: 30 },
  { header: "Status", type: "text", value: archivedState, width: 12 },
  { header: "Used by (deals)", type: "number", value: (r) => r.reference_count, width: 16 },
  { header: "Archived at", type: "date", value: (r) => r.archived_at, width: 20 },
];

// --- deals (M1 §3.1) --------------------------------------------------------

/** Human labels for the deal enums; the archive is for the agent, not the DB. */
const DEAL_TRANSACTION_LABELS: Record<Deal["transaction_type"], string> = {
  sale: "Sale",
  rental: "Rental",
};
const DEAL_TYPE_LABELS: Record<Deal["deal_type"], string> = {
  developer: "Developer",
  resale: "Resale",
  n_a: "N/A",
};

/**
 * The deal log. Money and rates come through DEAL_SELECT's `::text` casts (via
 * listDeals), so the archive reproduces every centavo. The rate column shows the
 * exact stored form — "1/12" stays "1/12", a decimal stays a decimal — because
 * that is what the engine used.
 */
const DEAL_COLUMNS: readonly ExportColumn<Deal>[] = [
  { header: "Deal Code", type: "text", value: (r) => r.deal_code, width: 12 },
  { header: "Booked Date", type: "date", value: (r) => r.booked_date, width: 14 },
  { header: "Transaction", type: "text", value: (r) => DEAL_TRANSACTION_LABELS[r.transaction_type], width: 12 },
  { header: "Deal Type", type: "text", value: (r) => DEAL_TYPE_LABELS[r.deal_type], width: 12 },
  { header: "Client", type: "text", value: (r) => r.client_name, width: 26 },
  { header: "Property", type: "text", value: (r) => r.property_details, width: 30 },
  { header: "List Price", type: "money", value: (r) => r.list_price, width: 16 },
  { header: "Net List Price", type: "money", value: (r) => r.net_list_price, width: 16 },
  { header: "Basis", type: "text", value: (r) => r.commission_basis, width: 10 },
  { header: "Rate / Fixed", type: "text", value: (r) => r.rate_pct ?? r.fixed_amount ?? "", width: 14 },
  { header: "GCI (Net of VAT)", type: "money", value: (r) => r.gci_net_of_vat, width: 16 },
  { header: "Incentive (Net)", type: "money", value: (r) => r.incentive_net, width: 16 },
  { header: "Referral Out", type: "money", value: (r) => r.referral_out, width: 16 },
  { header: "NET GCI", type: "money", value: (r) => r.net_gci, width: 16 },
  { header: "VAT (memo)", type: "money", value: (r) => r.vat_memo, width: 14 },
  { header: "EWT (memo)", type: "money", value: (r) => r.ewt_memo, width: 14 },
  { header: "Yield on List", type: "number", value: (r) => r.yield_on_list, width: 14 },
  { header: "Year", type: "number", value: (r) => r.booked_year, width: 8 },
  { header: "Status", type: "text", value: archivedState, width: 12 },
];

// --- receivables (M4 §3.1) --------------------------------------------------

const RECEIVABLE_STATUS_LABELS: Record<ReceivableRow["status"], string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

/**
 * The receivables ledger (FR-M4-12). Money comes through RECEIVABLE_SELECT's
 * `::text` casts, so the archive ties to the centavo. The override marker is the
 * Confirmed Collectible column: a value there means Total Collectible was
 * user-confirmed (the sheet's blue cell). Payment-derived columns (Collected,
 * Balance) are still at their M4.1 defaults and fill in with M4.2.
 */
const RECEIVABLE_COLUMNS: readonly ExportColumn<ReceivableRow>[] = [
  { header: "Deal Code", type: "text", value: (r) => r.deal_code, width: 12 },
  { header: "Year", type: "number", value: (r) => r.booked_year, width: 8 },
  { header: "Developer", type: "text", value: (r) => r.developer?.name ?? "", width: 22 },
  { header: "Client", type: "text", value: (r) => r.client_name, width: 24 },
  { header: "Property", type: "text", value: (r) => r.property_details, width: 28 },
  { header: "Deal Type", type: "text", value: (r) => DEAL_TYPE_LABELS[r.deal_type], width: 12 },
  { header: "Payor", type: "text", value: (r) => receivablePayor(r), width: 22 },
  { header: "Booked NET GCI", type: "money", value: (r) => r.booked_net_gci, width: 16 },
  { header: "Total Collectible", type: "money", value: (r) => r.total_collectible, width: 16 },
  {
    header: "Confirmed (override)",
    type: "money",
    value: (r) => r.confirmed_collectible ?? "",
    width: 18,
  },
  { header: "Collected (Net of VAT)", type: "money", value: (r) => r.collected_net, width: 18 },
  { header: "Status", type: "text", value: (r) => RECEIVABLE_STATUS_LABELS[r.status], width: 12 },
  { header: "Next Action", type: "text", value: (r) => r.next_action_note ?? "", width: 32 },
  {
    header: "Deal status",
    type: "text",
    value: (r) => (r.archived_at ? "Archived" : "Active"),
    width: 12,
  },
];

// --- payments (M5 §3.1) -----------------------------------------------------

const PAYMENT_TYPE_LABELS: Record<PaymentRow["payment_type"], string> = {
  commission: "Commission",
  incentive: "Incentive",
};

/**
 * The payments log (FR-M5-11). Money comes through PAYMENT_SELECT's `::text` casts
 * (via listPayments), so the archive reproduces every centavo of the stored split.
 * The deal identity columns (code, year, developer, client, property) are the
 * JOINED current values (renames propagate) — only the tax split is the snapshot.
 */
const PAYMENT_COLUMNS: readonly ExportColumn<PaymentRow>[] = [
  { header: "Date", type: "date", value: (r) => r.payment_date, width: 14 },
  { header: "Deal Code", type: "text", value: (r) => r.deal?.deal_code ?? "", width: 12 },
  { header: "Deal Year", type: "number", value: (r) => r.deal?.booked_year ?? "", width: 10 },
  { header: "Developer", type: "text", value: (r) => r.deal?.developer?.name ?? "", width: 22 },
  { header: "Client", type: "text", value: (r) => r.deal?.client_name ?? "", width: 24 },
  { header: "Property", type: "text", value: (r) => r.deal?.property_details ?? "", width: 28 },
  { header: "Type", type: "text", value: (r) => PAYMENT_TYPE_LABELS[r.payment_type], width: 12 },
  { header: "Gross", type: "money", value: (r) => r.gross_amount, width: 16 },
  { header: "Net of VAT", type: "money", value: (r) => r.net_of_vat, width: 16 },
  { header: "VAT", type: "money", value: (r) => r.vat_amount, width: 14 },
  { header: "EWT", type: "money", value: (r) => r.ewt_amount, width: 14 },
  { header: "Net Cash", type: "money", value: (r) => r.net_cash, width: 16 },
  { header: "Retained", type: "money", value: (r) => r.retained_cash, width: 16 },
  { header: "Note", type: "text", value: (r) => r.reference_note ?? "", width: 24 },
  { header: "Status", type: "text", value: archivedState, width: 12 },
];

/** The URL segment: /api/export/property-types?format=csv */
export const EXPORT_DATASETS = [
  "deals",
  "receivables",
  "payments",
  "property-types",
  "developers",
  "lead-sources",
] as const;

export type ExportDatasetName = (typeof EXPORT_DATASETS)[number];

export function isExportDataset(value: string): value is ExportDatasetName {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

/** The deal list's view filters (FR-M1-02), threaded so the download matches
 * what is on screen (AC8): a booking year, and active-only vs archived-only. */
export type DealExportFilters = { year?: number; archived?: boolean };

export async function loadExportDataset(
  name: ExportDatasetName,
  filters: DealExportFilters = {}
): Promise<ExportDataset<unknown>> {
  switch (name) {
    case "deals": {
      // The list toggle is exclusive — active OR archived — so mirror that here
      // rather than always dumping both, and honour the year filter.
      const rows = (await listDeals({ includeArchived: true, year: filters.year })).filter(
        (deal) => (filters.archived ? deal.archived_at !== null : deal.archived_at === null)
      );
      return dataset({
        name: "deals",
        sheet: "Deals",
        columns: DEAL_COLUMNS,
        rows,
      });
    }
    case "receivables": {
      // The ledger's active/archived view is exclusive, mirroring the deals export.
      const rows = (await listReceivables({ includeArchived: true })).filter((r) =>
        filters.archived ? r.archived_at !== null : r.archived_at === null
      );
      return dataset({
        name: "receivables",
        sheet: "Receivables",
        columns: RECEIVABLE_COLUMNS,
        rows,
      });
    }
    case "payments": {
      // Mirror the deals/receivables active-vs-archived exclusive view.
      const rows = (await listPayments({ includeArchived: true })).filter((p) =>
        filters.archived ? p.archived_at !== null : p.archived_at === null
      );
      return dataset({
        name: "payments",
        sheet: "Payments",
        columns: PAYMENT_COLUMNS,
        rows,
      });
    }
    case "property-types":
      return dataset({
        name: "property-types",
        sheet: "Property Types",
        columns: PROPERTY_TYPE_COLUMNS,
        rows: await listPropertyTypes(),
      });
    case "developers":
      return dataset({
        name: "developers",
        sheet: "Developers",
        columns: DEVELOPER_COLUMNS,
        rows: await listDevelopers(),
      });
    case "lead-sources":
      return dataset({
        name: "lead-sources",
        sheet: "Lead Sources",
        columns: LEAD_SOURCE_COLUMNS,
        rows: await listLeadSources(),
      });
  }
}

// --- the whole-workspace export (FR-M0-10) ----------------------------------

/**
 * The tables with no settings screen of their own. Money and rates come through
 * their `::text` selects (src/lib/supabase/selects) so the CSV reproduces the
 * database exactly — the archival copy must tie to the centavo (see format.ts).
 * jsonb columns (field_changes) are serialised to their JSON text; they carry
 * the same exact decimal strings the write path put there.
 */

const WORKSPACE_COLUMNS: readonly ExportColumn<Workspace>[] = [
  { header: "Workspace ID", type: "text", value: (r) => r.id, width: 38 },
  { header: "Name", type: "text", value: (r) => r.name, width: 28 },
  { header: "Currency", type: "text", value: (r) => r.currency, width: 10 },
  { header: "Time zone", type: "text", value: (r) => r.timezone, width: 16 },
  { header: "Deals recorded", type: "number", value: (r) => r.deal_id_sequence, width: 16 },
  { header: "Created at", type: "date", value: (r) => r.created_at, width: 20 },
  { header: "Updated at", type: "date", value: (r) => r.updated_at, width: 20 },
];

const PROFILE_COLUMNS: readonly ExportColumn<Profile>[] = [
  { header: "User ID", type: "text", value: (r) => r.id, width: 38 },
  { header: "Email", type: "text", value: (r) => r.email, width: 30 },
  { header: "Display name", type: "text", value: (r) => r.display_name, width: 24 },
  { header: "Created at", type: "date", value: (r) => r.created_at, width: 20 },
  { header: "Updated at", type: "date", value: (r) => r.updated_at, width: 20 },
];

const MEMBERSHIP_COLUMNS: readonly ExportColumn<Membership>[] = [
  { header: "Workspace ID", type: "text", value: (r) => r.workspace_id, width: 38 },
  { header: "User ID", type: "text", value: (r) => r.user_id, width: 38 },
  { header: "Role", type: "text", value: (r) => r.role, width: 12 },
  { header: "Created at", type: "date", value: (r) => r.created_at, width: 20 },
];

const TAX_SETTINGS_COLUMNS: readonly ExportColumn<TaxSettings>[] = [
  // Rates as the exact stored decimal (0.1200), not a percent — the archive
  // ties to the database, and "number" keeps the exact string in the CSV.
  { header: "VAT rate", type: "number", value: (r) => r.vat_rate, width: 12 },
  { header: "VAT registered", type: "boolean", value: (r) => r.vat_registered, width: 14 },
  {
    header: "VAT registration confirmed at",
    type: "date",
    value: (r) => r.vat_registered_confirmed_at,
    width: 22,
  },
  { header: "EWT rate", type: "number", value: (r) => r.ewt_rate, width: 12 },
  {
    header: "Property VAT threshold",
    type: "money",
    value: (r) => r.property_vat_threshold,
    width: 20,
  },
  { header: "Chase idle months", type: "number", value: (r) => r.chase_idle_months, width: 16 },
  { header: "Updated at", type: "date", value: (r) => r.updated_at, width: 20 },
];

const AUDIT_LOG_COLUMNS: readonly ExportColumn<AuditLogEntry>[] = [
  { header: "Occurred at", type: "date", value: (r) => r.occurred_at, width: 20 },
  { header: "Entity", type: "text", value: (r) => r.entity_type, width: 16 },
  { header: "Entity ID", type: "text", value: (r) => r.entity_id, width: 38 },
  { header: "Action", type: "text", value: (r) => r.action, width: 14 },
  { header: "Actor (user ID)", type: "text", value: (r) => r.actor_user_id, width: 38 },
  // The exact old→new diff, JSON text — the same strings the trail stores.
  {
    header: "Changes",
    type: "text",
    value: (r) => JSON.stringify(r.field_changes ?? {}),
    width: 50,
  },
];

const SETTINGS_EVENT_COLUMNS: readonly ExportColumn<SettingsChangeEvent>[] = [
  { header: "Occurred at", type: "date", value: (r) => r.occurred_at, width: 20 },
  { header: "Entity", type: "text", value: (r) => r.entity_type, width: 16 },
  { header: "Entity ID", type: "text", value: (r) => r.entity_id, width: 38 },
  {
    header: "Restating changes",
    type: "text",
    value: (r) => JSON.stringify(r.field_changes ?? {}),
    width: 44,
  },
  { header: "Affected deals", type: "number", value: (r) => r.affected_deal_count, width: 16 },
  { header: "Consumed at", type: "date", value: (r) => r.consumed_at, width: 20 },
  { header: "Consumed by", type: "text", value: (r) => r.consumed_by, width: 20 },
];

/** Filename stem for the whole-workspace archive. */
export const WORKSPACE_EXPORT_NAME = "workspace";

/**
 * Every dataset in the workspace, for the "it's my data" archive (FR-M0-10).
 * Loaded in parallel — each is an independent RLS-scoped read. Order is the
 * reading order: what the workspace *is*, then who owns it, then how it computes
 * money, then the lists, then the trails.
 */
export async function loadWorkspaceExport(): Promise<ExportDataset<unknown>[]> {
  const supabase = await createClient();

  const [
    workspace,
    profile,
    membership,
    taxSettings,
    deals,
    receivables,
    payments,
    propertyTypes,
    developers,
    leadSources,
    audit,
    events,
  ] = await Promise.all([
    supabase.from("workspace").select(WORKSPACE_SELECT).returns<Workspace[]>(),
    supabase.from("profiles").select(PROFILES_SELECT).returns<Profile[]>(),
    supabase.from("membership").select("*").returns<Membership[]>(),
    supabase.from("tax_settings").select(TAX_SETTINGS_SELECT).returns<TaxSettings[]>(),
    listDeals({ includeArchived: true }),
    listReceivables({ includeArchived: true }),
    listPayments({ includeArchived: true }),
    listPropertyTypes(),
    listDevelopers(),
    listLeadSources(),
    supabase
      .from("audit_log_entry")
      .select(AUDIT_LOG_SELECT)
      .order("occurred_at", { ascending: true })
      .returns<AuditLogEntry[]>(),
    supabase
      .from("settings_change_event")
      .select(SETTINGS_CHANGE_EVENT_SELECT)
      .order("occurred_at", { ascending: true })
      .returns<SettingsChangeEvent[]>(),
  ]);

  const firstError =
    workspace.error ??
    profile.error ??
    membership.error ??
    taxSettings.error ??
    audit.error ??
    events.error;
  if (firstError) {
    throw new Error(`Could not read your workspace for export: ${firstError.message}`);
  }

  return [
    dataset({ name: "workspace", sheet: "Workspace", columns: WORKSPACE_COLUMNS, rows: workspace.data ?? [] }),
    dataset({ name: "account", sheet: "Account", columns: PROFILE_COLUMNS, rows: profile.data ?? [] }),
    dataset({ name: "membership", sheet: "Membership", columns: MEMBERSHIP_COLUMNS, rows: membership.data ?? [] }),
    dataset({ name: "tax-settings", sheet: "Tax Settings", columns: TAX_SETTINGS_COLUMNS, rows: taxSettings.data ?? [] }),
    dataset({ name: "deals", sheet: "Deals", columns: DEAL_COLUMNS, rows: deals }),
    dataset({ name: "receivables", sheet: "Receivables", columns: RECEIVABLE_COLUMNS, rows: receivables }),
    dataset({ name: "payments", sheet: "Payments", columns: PAYMENT_COLUMNS, rows: payments }),
    dataset({ name: "property-types", sheet: "Property Types", columns: PROPERTY_TYPE_COLUMNS, rows: propertyTypes }),
    dataset({ name: "developers", sheet: "Developers", columns: DEVELOPER_COLUMNS, rows: developers }),
    dataset({ name: "lead-sources", sheet: "Lead Sources", columns: LEAD_SOURCE_COLUMNS, rows: leadSources }),
    dataset({ name: "audit-log", sheet: "Audit Log", columns: AUDIT_LOG_COLUMNS, rows: audit.data ?? [] }),
    dataset({ name: "settings-change-events", sheet: "Settings Events", columns: SETTINGS_EVENT_COLUMNS, rows: events.data ?? [] }),
  ];
}
