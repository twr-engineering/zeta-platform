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

/** The three sheet sort presets (PRD C10 / Rule 7). Per-column sort is a UI superset. */
export const SORT_OPTIONS = ["default", "date_oldest", "amount_desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

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
  source: SearchSource;
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
