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
import { formatRateAsPercent, toMoney } from "@/lib/money";
import { manilaToday, manilaYear } from "@/lib/date/manila";
import {
  computePlan,
  planYearTargetToInput,
  planToRows,
  CALCULATOR_PLAN_COLUMNS,
  type PlanExportRow,
} from "@/lib/planning";
import { getPlanYearTarget, getFunnelRates, getPlanYtdAggregate } from "@/lib/planning/queries";
import { getPlanningBasis } from "@/lib/yield/planning-basis";
import { listDeals } from "@/lib/deals/queries";
import {
  classifySegment,
  reportFromAggregates,
  planningBasisFromAggregates,
  type ClassifiableDeal,
  type YearFilter,
} from "@/lib/yield";
import { loadYieldAggregates } from "@/lib/yield/queries";
import { yieldReportToRows, YIELD_SUMMARY_COLUMNS } from "@/lib/yield/export-rows";
import { getSourcePerformance } from "@/lib/source-performance/queries";
import {
  sourcePerformanceToRows,
  SOURCE_PERFORMANCE_COLUMNS,
} from "@/lib/source-performance/export-rows";
import type { DealSegmentFilter } from "@/lib/routes";
import {
  listReceivables,
  receivablePayor,
  type ReceivableRow,
} from "@/lib/receivables/queries";
import {
  agingBucketOf,
  type AgingBucketKey,
  type ChaseFollowUp,
} from "@/lib/receivables/projections";
import { buildAging, buildByDeveloper, buildChase } from "@/lib/dashboard/sections";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { listPayments, getWorkspaceRates, type PaymentRow } from "@/lib/payments/queries";
import { isStaleBasis } from "@/lib/payments/stale";
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

// --- dashboard tabular sections (M6 §4/§5, FR-M6-14) ------------------------

/**
 * One aging bucket (or the TOTAL) as an export row. % of outstanding is the
 * builder's exact rate string, formatted to the on-screen 2-dp percent so the
 * download ties to the table (AC8); "—" when there is nothing outstanding.
 */
type AgingExportRow = {
  bucket: string;
  count: number;
  balance: string;
  share: string | null;
};

const AGING_COLUMNS: readonly ExportColumn<AgingExportRow>[] = [
  { header: "Bucket", type: "text", value: (r) => r.bucket, width: 16 },
  { header: "# Deals", type: "number", value: (r) => r.count, width: 10 },
  { header: "Balance", type: "money", value: (r) => r.balance, width: 18 },
  {
    header: "% of Outstanding",
    type: "text",
    value: (r) => (r.share === null ? "—" : formatRateAsPercent(r.share)),
    width: 18,
  },
];

type DeveloperExportRow = {
  developer: string;
  dealsWithBalance: number;
  balance: string;
  collectedNet: string;
  pctCollected: string | null;
  avgDaysToFirstRelease: number | null;
};

const BY_DEVELOPER_COLUMNS: readonly ExportColumn<DeveloperExportRow>[] = [
  { header: "Developer", type: "text", value: (r) => r.developer, width: 30 },
  { header: "Deals w/ Balance", type: "number", value: (r) => r.dealsWithBalance, width: 16 },
  { header: "Balance", type: "money", value: (r) => r.balance, width: 18 },
  { header: "Collected Net", type: "money", value: (r) => r.collectedNet, width: 18 },
  {
    header: "% Collected",
    type: "text",
    value: (r) => (r.pctCollected === null ? "—" : formatRateAsPercent(r.pctCollected)),
    width: 14,
  },
  {
    header: "Avg Days → 1st Release",
    type: "text",
    value: (r) => (r.avgDaysToFirstRelease === null ? "—" : String(r.avgDaysToFirstRelease)),
    width: 20,
  },
];

/** The plain-text follow-up label the chase export writes (the on-screen chip text). */
const CHASE_FOLLOW_UP_LABELS: Record<ChaseFollowUp, string> = {
  no_payment_yet: "no payment yet",
  chase: "⚠ chase",
  ok: "ok",
};

/** One chase-list row as an export row — the nine on-screen columns (FR-M6-14). */
type ChaseExportRow = {
  dealCode: string;
  clientName: string;
  balance: string | null;
  lastPaymentDate: string | null;
  monthsIdle: number | null;
  followUp: ChaseFollowUp;
  developerName: string | null;
  bookedNetGci: string;
  nextActionNote: string | null;
};

const CHASE_COLUMNS: readonly ExportColumn<ChaseExportRow>[] = [
  { header: "Deal ID", type: "text", value: (r) => r.dealCode, width: 12 },
  { header: "Client", type: "text", value: (r) => r.clientName, width: 26 },
  { header: "Balance", type: "money", value: (r) => r.balance ?? "", width: 18 },
  { header: "Last Payment", type: "date", value: (r) => r.lastPaymentDate, width: 14 },
  {
    header: "Months Idle",
    type: "text",
    value: (r) => (r.monthsIdle === null ? "—" : String(r.monthsIdle)),
    width: 12,
  },
  { header: "Follow up?", type: "text", value: (r) => CHASE_FOLLOW_UP_LABELS[r.followUp], width: 14 },
  { header: "Developer", type: "text", value: (r) => r.developerName ?? "", width: 22 },
  { header: "Booked GCI", type: "money", value: (r) => r.bookedNetGci, width: 16 },
  { header: "Next Action", type: "text", value: (r) => r.nextActionNote ?? "", width: 40 },
];

// --- Yield Summary (FR-M2-09) -----------------------------------------------

/** Segment membership for a deal export drill-through — the shared classifier. */
function dealInSegment(deal: Deal, segment: DealSegmentFilter): boolean {
  const seg = classifySegment(deal as unknown as ClassifiableDeal);
  if (segment === "sales") return seg === "resale" || seg === "developer";
  return seg === segment;
}

/** The URL segment: /api/export/property-types?format=csv */
export const EXPORT_DATASETS = [
  "deals",
  "receivables",
  "payments",
  "property-types",
  "developers",
  "lead-sources",
  "dashboard-aging",
  "dashboard-by-developer",
  "dashboard-chase",
  "yield-summary",
  "calculator-plan",
  "source-performance",
] as const;

export type ExportDatasetName = (typeof EXPORT_DATASETS)[number];

export function isExportDataset(value: string): value is ExportDatasetName {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

/** The deal list's view filters (FR-M1-02), threaded so the download matches
 * what is on screen (AC8): a booking year, and active-only vs archived-only.
 * The receivables ledger (FR-M4-12, AC8) adds its own filters — status,
 * developer, has-balance, overridden-only and free text — so its export ties to
 * the on-screen filtered set. Unused fields are ignored per dataset. */
export type DealExportFilters = {
  year?: number;
  archived?: boolean;
  status?: ReceivableRow["status"];
  developerId?: string;
  hasBalance?: boolean;
  overridden?: boolean;
  text?: string;
  /** Payments list (FR-M5-11, §6.2): month_paid + payment_type. `year` is read as
   * year_paid, `developerId` as the deal's developer, `text` over the same fields
   * the on-screen search covers — so the download matches the screen (AC8). */
  month?: number;
  paymentType?: PaymentRow["payment_type"];
  /** M6 dashboard drill-down filters (FR-M6-12) that ride along so a download
   * from a drilled-in list still matches the screen (AC8). Aging bucket + the
   * two Data-Health receivable filters; the payment stale-basis flag; and the
   * deal referral-owed flag. Each is honoured only by the dataset that owns it. */
  bucket?: AgingBucketKey;
  overpaid?: boolean;
  varianceOverTolerance?: boolean;
  stale?: boolean;
  referralUnpaid?: boolean;
  /** Yield Summary segment drill-through (FR-M2-12): the deal list export ties to
   * the drilled segment row, and the yield-summary export reads it as the year filter
   * ("all" when `year` is absent). */
  segment?: DealSegmentFilter;
  /** Source Performance drill-through (FR-M7-09): a lead_source_id filtering the deal
   * list export to one source. The source-performance export reads `year` as its own
   * booking-year filter ("all" when absent). */
  source?: string;
};

export async function loadExportDataset(
  name: ExportDatasetName,
  filters: DealExportFilters = {}
): Promise<ExportDataset<unknown>> {
  switch (name) {
    case "deals": {
      // The list toggle is exclusive — active OR archived — so mirror that here
      // rather than always dumping both, and honour the year filter.
      const rows = (await listDeals({ includeArchived: true, year: filters.year })).filter(
        (deal) => {
          if (filters.archived ? deal.archived_at === null : deal.archived_at !== null)
            return false;
          // Data Health (d) drill-down: referral fee owed out and not yet paid.
          if (
            filters.referralUnpaid &&
            !(toMoney(deal.referral_out).greaterThan(0) && !deal.referral_paid)
          )
            return false;
          // Yield Summary segment drill-through (FR-M2-12) — same classifier as the list.
          if (filters.segment && !dealInSegment(deal, filters.segment)) return false;
          // Source Performance drill-through (FR-M7-09) — the deals of one lead source.
          if (filters.source && deal.lead_source_id !== filters.source) return false;
          return true;
        }
      );
      return dataset({
        name: "deals",
        sheet: "Deals",
        columns: DEAL_COLUMNS,
        rows,
      });
    }
    case "receivables": {
      // The ledger's active/archived view is exclusive, mirroring the deals
      // export; the ledger's on-screen filters ride along so the download ties
      // to exactly what is shown (AC8).
      const needle = filters.text?.trim().toLowerCase() ?? "";
      const rows = (await listReceivables({ includeArchived: true })).filter((r) => {
        if (filters.archived ? r.archived_at === null : r.archived_at !== null) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (filters.developerId !== undefined) {
          if (
            filters.developerId === "none"
              ? r.developer_id !== null
              : r.developer_id !== filters.developerId
          )
            return false;
        }
        if (filters.hasBalance && !(r.balance !== null && toMoney(r.balance).greaterThan(0)))
          return false;
        if (filters.overridden && r.confirmed_collectible === null) return false;
        // Aging bucket (§4): open, balance-owing rows matching the live age.
        if (filters.bucket !== undefined) {
          const owing = r.status === "open" && r.balance !== null && toMoney(r.balance).greaterThan(0);
          if (!owing || r.age_months === null || agingBucketOf(r.age_months) !== filters.bucket)
            return false;
        }
        // Data Health (b): Open, paid in full or over (signed balance ≤ 0).
        if (
          filters.overpaid &&
          !(r.status === "open" && r.balance !== null && toMoney(r.balance).lessThanOrEqualTo(0))
        )
          return false;
        // Data Health (c): Closed, short/over by more than ₱0.50.
        if (
          filters.varianceOverTolerance &&
          !(r.status === "closed" && r.variance !== null && toMoney(r.variance).abs().greaterThan(toMoney("0.50")))
        )
          return false;
        if (needle) {
          const hay = `${r.deal_code} ${r.client_name} ${r.property_details}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
      return dataset({
        name: "receivables",
        sheet: "Receivables",
        columns: RECEIVABLE_COLUMNS,
        rows,
      });
    }
    case "payments": {
      // The payments list's on-screen filters ride along so the download ties to
      // exactly what is shown (AC8, FR-M5-11). Mirrors payments-list.tsx's client
      // filter predicate field-for-field; money/identity are read-time joins.
      const needle = filters.text?.trim().toLowerCase() ?? "";
      // Stale-basis (M5 Data Health) rides along too: read the CURRENT rates once
      // and apply the same pure predicate the list uses, so a drilled-in download
      // matches the flagged rows (AC8, FR-M5-12).
      const currentRates = filters.stale ? await getWorkspaceRates() : null;
      const rows = (await listPayments({ includeArchived: true })).filter((p) => {
        if (filters.archived ? p.archived_at === null : p.archived_at !== null) return false;
        if (filters.year !== undefined && p.year_paid !== filters.year) return false;
        if (filters.month !== undefined && p.month_paid !== filters.month) return false;
        if (filters.paymentType && p.payment_type !== filters.paymentType) return false;
        if (currentRates) {
          if (
            p.deal === null ||
            !isStaleBasis(p, {
              vat_basis: p.deal.vat_basis,
              ewt_rate: currentRates.ewt_rate,
              vat_rate: currentRates.vat_rate,
            })
          )
            return false;
        }
        if (filters.developerId !== undefined) {
          const devId = p.deal?.developer?.id ?? null;
          if (filters.developerId === "none" ? devId !== null : devId !== filters.developerId)
            return false;
        }
        if (needle) {
          const hay = `${p.deal?.deal_code ?? ""} ${p.deal?.client_name ?? ""} ${p.deal?.property_details ?? ""} ${p.reference_note ?? ""}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
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
    case "dashboard-aging": {
      // Year-independent (§4): the aging table is all-time current-state. Build
      // from the same pure builder the screen reads, then append the TOTAL row.
      const aging = buildAging(await listReceivables({ today: manilaToday() }));
      const rows: AgingExportRow[] = aging.buckets.map((b) => ({
        bucket: b.label,
        count: b.count,
        balance: b.balance,
        share: b.shareOfOutstanding,
      }));
      const totalCount = aging.buckets.reduce((n, b) => n + b.count, 0);
      rows.push({
        bucket: "TOTAL",
        count: totalCount,
        balance: aging.totalBalance,
        // 100% when anything is outstanding; "—" when the table is empty.
        share: toMoney(aging.totalBalance).isZero() ? null : "1",
      });
      return dataset({
        name: "dashboard-aging",
        sheet: "Aging",
        columns: AGING_COLUMNS,
        rows,
      });
    }
    case "dashboard-by-developer": {
      const byDev = buildByDeveloper(await listReceivables({ today: manilaToday() }));
      const rows: DeveloperExportRow[] = [...byDev.rows, byDev.total].map((d) => ({
        developer: d.developerName,
        dealsWithBalance: d.dealsWithBalance,
        balance: d.balance,
        collectedNet: d.collectedNet,
        pctCollected: d.pctCollected,
        avgDaysToFirstRelease: d.avgDaysToFirstRelease,
      }));
      return dataset({
        name: "dashboard-by-developer",
        sheet: "By Developer",
        columns: BY_DEVELOPER_COLUMNS,
        rows,
      });
    }
    case "dashboard-chase": {
      // Year-independent (§4): the chase list is all-time current-state, ordered by
      // the same Rule Q the screen uses (balance DESC, idle DESC, deal_code). The
      // follow-up chip needs the workspace's chase_idle_months, exactly as the screen.
      const context = await getWorkspaceContext();
      const chaseIdleMonths = context?.taxSettings?.chase_idle_months ?? 3;
      const chase = buildChase(await listReceivables({ today: manilaToday() }), chaseIdleMonths);
      const rows: ChaseExportRow[] = chase.rows.map((r) => ({
        dealCode: r.dealCode,
        clientName: r.clientName,
        balance: r.balance,
        lastPaymentDate: r.lastPaymentDate,
        monthsIdle: r.monthsIdle,
        followUp: r.followUp,
        developerName: r.developerName,
        bookedNetGci: r.bookedNetGci,
        nextActionNote: r.nextActionNote,
      }));
      return dataset({
        name: "dashboard-chase",
        sheet: "Chase List",
        columns: CHASE_COLUMNS,
        rows,
      });
    }
    case "yield-summary": {
      // The report table + memos + averages are year-scoped (the on-screen filter);
      // the planning-basis lines are all-time (Rule 4). Both read the ONE materialized
      // aggregate — the same cells the screen reduces — so the download ties to the
      // screen (AC8 / FR-M2-09). `year` absent ⇒ the "All" filter, matching the screen.
      const yearFilter: YearFilter = filters.year ?? "all";
      const cells = await loadYieldAggregates();
      const rows = yieldReportToRows(
        reportFromAggregates(cells, yearFilter),
        planningBasisFromAggregates(cells)
      );
      return dataset({
        name: "yield-summary",
        sheet: "Yield Summary",
        columns: YIELD_SUMMARY_COLUMNS,
        rows,
      });
    }
    case "calculator-plan": {
      // The plan view (economic model + goals + funnels + pace) for the selected year
      // (FR-M3-12). Reads the SAME server model the screen computes from — the stored
      // target row + global rates + the M2 planning basis — through the ONE engine
      // (computePlan), so the download ties to the screen. `year` absent ⇒ the current
      // Manila year, matching the screen's default. A not-plannable year exports a single
      // line naming why (the same typed issues the screen renders inline), never an error.
      const year = filters.year ?? manilaYear();
      const [row, rates, basis, ytd] = await Promise.all([
        getPlanYearTarget(year),
        getFunnelRates(),
        getPlanningBasis(),
        getPlanYtdAggregate(year),
      ]);
      const input = row
        ? planYearTargetToInput(row)
        : {
            year,
            netIncomeTarget: null,
            opexPct: null,
            cosPct: null,
            yieldOverride: null,
            avgPriceOverride: null,
          };
      const result = computePlan(input, rates, basis, ytd);
      const rows: PlanExportRow[] = result.ok
        ? planToRows(result.plan)
        : [
            {
              line: `No plan for ${year}`,
              yearly: null,
              monthly: null,
              weekly: null,
              detail: result.issues.map((i) => i.message).join("; "),
            },
          ];
      return dataset({
        name: "calculator-plan",
        sheet: "GCI Plan",
        columns: CALCULATOR_PLAN_COLUMNS,
        rows,
      });
    }
    case "source-performance": {
      // The lead-channel scorecard (FR-M7-08) for the selected booking year (or "all").
      // Reads the SAME M7.1 service the screen renders — one row per visible source +
      // the pinned TOTAL — so the download ties to the screen to the centavo (AC9).
      // `year` absent ⇒ the "All" filter, matching the screen's default.
      const yearFilter: number | "all" = filters.year ?? "all";
      const report = await getSourcePerformance(yearFilter);
      return dataset({
        name: "source-performance",
        sheet: "Source Performance",
        columns: SOURCE_PERFORMANCE_COLUMNS,
        rows: sourcePerformanceToRows(report),
      });
    }
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
