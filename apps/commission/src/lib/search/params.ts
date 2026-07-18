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
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_TEXT_LENGTH,
  SEARCH_SOURCES,
  SEARCH_STATUSES,
  SORT_OPTIONS,
  type SearchQuery,
  type SearchSource,
  type SearchStatus,
  type SortOption,
} from "./types";

export type ParsedSearchQuery = {
  query: SearchQuery;
  /** True when the text filter exceeded MAX_TEXT_LENGTH and was trimmed (Rule 12). */
  textTruncated: boolean;
};

function pickSource(raw: string | null): SearchSource {
  return (SEARCH_SOURCES as readonly string[]).includes(raw ?? "")
    ? (raw as SearchSource)
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
