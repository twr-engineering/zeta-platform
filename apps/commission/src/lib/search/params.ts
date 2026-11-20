/**
 * M9 — parse + validate URL search params into a typed SearchQuery.
 *
 * Enforces the filter-applicability matrix at the edge (Rule 6): `status` and
 * `only_with_balance` are dropped for any source other than Collectibles, so they
 * can never leak into a Deals/Payments query even if hand-crafted onto the URL.
 * Nothing throws — an unparseable value falls back to its default (the sheet never
 * errors on a bad filter; Rules 8/9). The 200-char text cap is reported so the UI
 * can show the "query trimmed" notice (Rule 12).
 */
import {
  ALL_SOURCE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_TEXT_LENGTH,
  SEARCH_SOURCES,
  SEARCH_STATUSES,
  SORT_OPTIONS,
  type QuerySource,
  type SearchQuery,
  type SearchStatus,
  type SortOption,
} from "./types";

/**
 * Serialize a SearchQuery back to URL params (the inverse of parseSearchQuery).
 *
 * Only non-default values are written, so a bare source reads `?source=deals` and
 * a shared link stays legible (FR-M9-12). `parseSearchQuery(serializeSearchQuery(q))`
 * round-trips every field. The client filter bar builds every navigation through
 * this one function so the URL — the single source of truth for the whole screen —
 * can never drift from the query the server ran (Rules 5/6; §6 "shareable URL").
 */
export function serializeSearchQuery(query: SearchQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set("source", query.source);
  if (query.year !== null) p.set("year", String(query.year));
  if (query.dealCode) p.set("deal_code", query.dealCode);
  // status / only_with_balance are Collectibles-only — never serialize them for
  // another source even if the caller left stale values on the object (Rule 6).
  if (query.source === "collectibles") {
    if (query.status) p.set("status", query.status);
    if (query.onlyWithBalance) p.set("only_with_balance", "true");
  }
  if (query.text.length > 0) p.set("text", query.text);
  if (query.sort !== "default") p.set("sort", query.sort);
  if (query.page > 1) p.set("page", String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) p.set("page_size", String(query.pageSize));
  return p;
}

export type ParsedSearchQuery = {
  query: SearchQuery;
  /** True when the text filter exceeded MAX_TEXT_LENGTH and was trimmed (Rule 12). */
  textTruncated: boolean;
};

/** The three concrete sources plus the unified "All" tab (M9.4); garbage → deals. */
function pickSource(raw: string | null): QuerySource {
  if (raw === ALL_SOURCE) return ALL_SOURCE;
  return (SEARCH_SOURCES as readonly string[]).includes(raw ?? "")
    ? (raw as QuerySource)
    : "deals";
}

function pickSort(raw: string | null): SortOption {
  return (SORT_OPTIONS as readonly string[]).includes(raw ?? "")
    ? (raw as SortOption)
    : "default";
}

function pickStatus(raw: string | null): SearchStatus | null {
  return (SEARCH_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as SearchStatus)
    : null;
}

/** Any 4-digit year; "all"/missing/garbage → null (Rule 3 — the "all" lens). */
function pickYear(raw: string | null): number | null {
  return raw && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

function pickPositiveInt(raw: string | null, fallback: number): number {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseSearchQuery(params: URLSearchParams): ParsedSearchQuery {
  const source = pickSource(params.get("source"));

  // `deal_code` is exact-match; a blank string is "no filter", a garbage code is
  // tolerated (it just yields the empty state, Rule 9).
  const dealCodeRaw = params.get("deal_code")?.trim() ?? "";
  const dealCode = dealCodeRaw.length > 0 ? dealCodeRaw : null;

  // Status / balance apply to Collectibles only (Rule 6) — dropped otherwise.
  const status = source === "collectibles" ? pickStatus(params.get("status")) : null;
  const onlyWithBalance =
    source === "collectibles" && params.get("only_with_balance") === "true";

  // Accept either `text` or `q` (the export route already uses `q`).
  const rawText = (params.get("text") ?? params.get("q") ?? "").trim();
  const textTruncated = rawText.length > MAX_TEXT_LENGTH;
  const text = textTruncated ? rawText.slice(0, MAX_TEXT_LENGTH) : rawText;

  const page = pickPositiveInt(params.get("page"), 1);
  const pageSize = Math.min(
    pickPositiveInt(params.get("page_size"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  return {
    query: {
      source,
      year: pickYear(params.get("year")),
      dealCode,
      status,
      onlyWithBalance,
      text,
      sort: pickSort(params.get("sort")),
      page,
      pageSize,
    },
    textTruncated,
  };
}
