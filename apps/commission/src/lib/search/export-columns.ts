/**
 * M9.3 — the search result set's export projection (PRD §3.2, FR-M9-11, AC11).
 *
 * The exported columns ARE the on-screen columns, in the on-screen order — the
 * download must reproduce "exactly the rows/columns/order on screen across all
 * pages" (FR-M9-11). So these three specs mirror `search-results.tsx` field for
 * field: the Deals / Payments / Collectibles tables' §3.2 projections, with the
 * same human enum labels the tables render. M9 computes NO money — every ₱ cell
 * is the source projection's exact `::text` string, written verbatim to CSV and
 * parsed once through decimal.js for the XLSX Number (see @/lib/export/format).
 *
 * Pure — no database, no request, no `server-only` — so the mapping and the
 * filename can be unit-tested against a projection row with no request (mirrors
 * the yield / source-performance / reports export-rows builders).
 */
import type { ExportColumn } from "@/lib/export/format";
import { DEAL_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/deals/labels";
import type {
  CollectibleSearchRow,
  DealSearchRow,
  PaymentSearchRow,
  SearchQuery,
  SearchResultRow,
  SearchSource,
} from "./types";

/** Collectibles status → the chip label the table renders (search-results.tsx). */
const STATUS_LABEL: Record<CollectibleSearchRow["status"], string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

// --- Deals (§3.2 — Deal ID · Date · Transaction · Deal Type · Developer ·
//     Client · Property · NET GCI) ------------------------------------------
const DEAL_EXPORT_COLUMNS: readonly ExportColumn<DealSearchRow>[] = [
  { header: "Deal ID", type: "text", value: (r) => r.dealCode, width: 12 },
  { header: "Date", type: "date", value: (r) => r.bookedDate, width: 14 },
  { header: "Transaction", type: "text", value: (r) => TRANSACTION_TYPE_LABELS[r.transactionType], width: 12 },
  { header: "Deal Type", type: "text", value: (r) => DEAL_TYPE_LABELS[r.dealType], width: 12 },
  // The table renders "—" for a missing developer; the archive carries the empty
  // string so a spreadsheet column stays clean rather than literal em-dashes.
  { header: "Developer", type: "text", value: (r) => r.developerName ?? "", width: 24 },
  { header: "Client", type: "text", value: (r) => r.clientName, width: 26 },
  { header: "Property", type: "text", value: (r) => r.propertyDetails, width: 30 },
  { header: "NET GCI", type: "money", value: (r) => r.netGci, width: 16 },
];

// --- Payments (§3.2 — Date · Deal ID · Client · Property · Gross · Net of VAT ·
//     Net Cash) ---------------------------------------------------------------
const PAYMENT_EXPORT_COLUMNS: readonly ExportColumn<PaymentSearchRow>[] = [
  { header: "Date", type: "date", value: (r) => r.paymentDate, width: 14 },
  { header: "Deal ID", type: "text", value: (r) => r.dealCode, width: 12 },
  { header: "Client", type: "text", value: (r) => r.clientName, width: 26 },
  { header: "Property", type: "text", value: (r) => r.propertyDetails, width: 30 },
  { header: "Gross", type: "money", value: (r) => r.gross, width: 16 },
  { header: "Net of VAT", type: "money", value: (r) => r.netOfVat, width: 16 },
  { header: "Net Cash", type: "money", value: (r) => r.netCash, width: 16 },
];

// --- Collectibles (§3.2 — Deal ID · Client · Property · Deal Type · Total
//     Collectible · Collected · Balance · Status) ----------------------------
const COLLECTIBLE_EXPORT_COLUMNS: readonly ExportColumn<CollectibleSearchRow>[] = [
  { header: "Deal ID", type: "text", value: (r) => r.dealCode, width: 12 },
  { header: "Client", type: "text", value: (r) => r.clientName, width: 26 },
  { header: "Property", type: "text", value: (r) => r.propertyDetails, width: 30 },
  { header: "Deal Type", type: "text", value: (r) => DEAL_TYPE_LABELS[r.dealType], width: 12 },
  { header: "Total Collectible", type: "money", value: (r) => r.totalCollectible, width: 18 },
  { header: "Collected", type: "money", value: (r) => r.collectedNet, width: 16 },
  // Balance is nullable (M4.1 defaults): the table renders "—", the archive an
  // empty cell (format.ts writes null money as blank — never a 0 that would read
  // as fully collected).
  { header: "Balance", type: "money", value: (r) => r.balance, width: 16 },
  { header: "Status", type: "text", value: (r) => STATUS_LABEL[r.status], width: 12 },
];

export type SearchExportSpec = {
  sheet: string;
  columns: readonly ExportColumn<SearchResultRow>[];
};

/**
 * The columns + sheet name for a source. The per-source column arrays are typed
 * to their own projection row; the registry idiom (see @/lib/export/datasets
 * `dataset()`) erases the Row generic at the boundary — format.ts is generic over
 * Row, so an opaque row is exactly right for the heterogeneous dispatch.
 */
export function searchExportSpec(source: SearchSource): SearchExportSpec {
  switch (source) {
    case "collectibles":
      return { sheet: "Collectibles", columns: COLLECTIBLE_EXPORT_COLUMNS as unknown as readonly ExportColumn<SearchResultRow>[] };
    case "payments":
      return { sheet: "Payments", columns: PAYMENT_EXPORT_COLUMNS as unknown as readonly ExportColumn<SearchResultRow>[] };
    case "deals":
    default:
      return { sheet: "Deals", columns: DEAL_EXPORT_COLUMNS as unknown as readonly ExportColumn<SearchResultRow>[] };
  }
}

/** A short filesystem-safe token from free text (Rule 4 already normalized it). */
function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
}

/**
 * The export filename stem (repo convention, mirroring M8's `tax-per-month-2026`
 * / `vintage-matrix-net_cash`): `search-<source>` plus the active filter hints, so
 * a downloads folder shows what each file is without opening it. `exportFilename`
 * (format.ts) dates and extends it → `zeta-search-collectibles-open-with-balance-2026-07-19.csv`.
 * Only active filters appear, in a stable order, so the same search always names
 * the same file.
 */
export function searchExportName(query: SearchQuery): string {
  const parts = [`search-${query.source}`];
  if (query.year !== null) parts.push(String(query.year));
  if (query.dealCode) parts.push(slug(query.dealCode));
  // status + only_with_balance are Collectibles-only (Rule 6); they can't be set
  // on another source, but guard anyway so a hand-crafted URL can't mislabel.
  if (query.source === "collectibles") {
    if (query.status) parts.push(query.status);
    if (query.onlyWithBalance) parts.push("with-balance");
  }
  if (query.text.length > 0) {
    const s = slug(query.text);
    if (s) parts.push(s);
  }
  if (query.sort !== "default") parts.push(query.sort.replace(/_/g, "-"));
  return parts.filter(Boolean).join("-");
}
