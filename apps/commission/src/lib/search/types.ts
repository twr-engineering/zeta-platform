/**
 * M9 Search Console — shared query-state + projection types.
 *
 * M9 persists nothing (PRD §3). These are (a) the SearchQuery the URL/UI carries,
 * (b) the three read-only projections over M1/M4/M5, and the constants the read
 * layer and the (later) UI both depend on. Money is carried as exact strings
 * end-to-end — M9 never re-derives money (PRD §3.2).
 */
import type { Deal, Receivable } from "@/types/entities";

export const SEARCH_SOURCES = ["deals", "collectibles", "payments"] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];

/**
 * The unified "All" tab (M9.4 / Rule 2 / OQ2 — resolved BUILD IT 2026-07-19). It is
 * NOT a fourth projection: it runs the three source queries and renders three grouped
 * sections, never a merged column set. So `SearchSource` stays the three concrete
 * projections (they drive runSearch, the §3.2 tables, and the export specs), and the
 * URL/UI's source is the wider `QuerySource` that also admits "all".
 */
export const ALL_SOURCE = "all" as const;
export type QuerySource = SearchSource | typeof ALL_SOURCE;

/** The three sections on the All tab, in §3.2 order (Deals · Collectibles · Payments). */
export const SEARCH_SECTIONS = SEARCH_SOURCES;

/**
 * Per-section row cap on the All tab. The unified tab is a scannable overview across
 * all three record sets on one screen (Rule 2 / M9.4 demo), not a paginated list —
 * each section shows the top rows in its own default order and a "view all N in <tab>"
 * link carries the shared filters into the single-source tab for the full, paged set.
 */
export const ALL_TAB_SECTION_LIMIT = 5;

/** The three sheet sort presets (PRD C10 / Rule 7). Per-column sort is a UI superset. */
export const SORT_OPTIONS = ["default", "date_oldest", "amount_desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

/**
 * The sort selector's options, worded per source (Rule 7 / the sheet's SORT).
 * The amount field and the date basis differ by source, so the labels must too —
 * a Deals reader sorts by NET GCI, a Payments reader by Gross, a Collectibles
 * reader by Balance.
 *
 * The Collectibles quirk (Rule 7 / OQ5): the sheet ALWAYS sorts Collectibles
 * balance-high→low and ignores the selector. The SaaS keeps that as the default and
 * adds exactly one defined mapping — Date (oldest) → booking date ascending — so
 * `amount_desc` would be identical to the default and is OMITTED from the selector
 * rather than shown as a no-op. The two visible options make the quirk legible:
 * balance-desc is the resting state, date-oldest the one deviation.
 */
export function sortOptionsFor(
  source: QuerySource
): { value: SortOption; label: string }[] {
  switch (source) {
    case "payments":
      return [
        { value: "default", label: "Newest paid" },
        { value: "date_oldest", label: "Oldest paid" },
        { value: "amount_desc", label: "Highest gross" },
      ];
    case "collectibles":
      return [
        { value: "default", label: "Balance (high → low)" },
        { value: "date_oldest", label: "Oldest booked" },
      ];
    case "deals":
    default:
      return [
        { value: "default", label: "Newest booked" },
        { value: "date_oldest", label: "Oldest booked" },
        { value: "amount_desc", label: "Highest NET GCI" },
      ];
  }
}

/** Status filter — Collectibles only (PRD C7 / Rule 6). */
export const SEARCH_STATUSES = ["open", "closed", "cancelled"] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

/** Rule 8 / AC9 — rendered verbatim for any zero-row result. Do not reword. */
export const EMPTY_STATE_MESSAGE =
  "No matching records — adjust your filters above.";

export const MAX_TEXT_LENGTH = 200; // Rule 12
export const DEFAULT_PAGE_SIZE = 50; // PRD §3.1
export const MAX_PAGE_SIZE = 200; // PRD §3.1

/** The full query state (PRD §3.1). Not persisted server-side. */
export type SearchQuery = {
  /** `all` is the unified tab (M9.4); the three concrete values are one-source-at-a-time (Rule 2). */
  source: QuerySource;
  /** null = "all". Booked year for Deals/Collectibles, paid year for Payments (Rule 3). */
  year: number | null;
  /** Exact deal_code match; unknown codes yield the empty state, never an error (Rule 9). */
  dealCode: string | null;
  /** Collectibles only; null elsewhere (Rule 6). */
  status: SearchStatus | null;
  /** Collectibles only; keeps balance > 0 (Rule 6). */
  onlyWithBalance: boolean;
  /** Normalized, diacritic-insensitive substring over client + property (Rule 4). */
  text: string;
  sort: SortOption;
  /** 1-based. */
  page: number;
  pageSize: number;
};

// --- Read-only projections (PRD §3.2) ---------------------------------------

export type DealSearchRow = {
  id: string;
  dealCode: string;
  bookedDate: string;
  transactionType: Deal["transaction_type"];
  dealType: Deal["deal_type"];
  developerName: string | null;
  clientName: string;
  propertyDetails: string;
  netGci: string;
  bookedYear: number;
  archived: boolean;
};

export type CollectibleSearchRow = {
  id: string;
  dealId: string;
  dealCode: string;
  clientName: string;
  propertyDetails: string;
  dealType: Receivable["deal_type"];
  totalCollectible: string;
  collectedNet: string;
  balance: string | null;
  status: Receivable["status"];
  bookedYear: number;
  archived: boolean;
};

export type PaymentSearchRow = {
  id: string;
  dealId: string;
  paymentDate: string;
  dealCode: string;
  clientName: string;
  propertyDetails: string;
  gross: string;
  netOfVat: string;
  netCash: string;
  yearPaid: number;
  archived: boolean;
};

export type SearchResultRow =
  | DealSearchRow
  | CollectibleSearchRow
  | PaymentSearchRow;

/**
 * A page of results plus the metadata the UI needs: the full matching `total`
 * (page-independent, for "128 matching records"), and the verbatim empty-state
 * message so callers never re-type it (Rule 8).
 */
export type SearchResult<Row extends SearchResultRow = SearchResultRow> = {
  source: SearchSource;
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  emptyMessage: string;
};

/**
 * The unified "All" tab's payload (M9.4): one capped result per section, each a
 * standalone §3.2 projection with its own count and empty state. The three run in
 * parallel server-side; the UI renders them as three grouped sections (Rule 2 —
 * never a merged column set).
 */
export type AllSearchResult = {
  deals: SearchResult<DealSearchRow>;
  collectibles: SearchResult<CollectibleSearchRow>;
  payments: SearchResult<PaymentSearchRow>;
};
