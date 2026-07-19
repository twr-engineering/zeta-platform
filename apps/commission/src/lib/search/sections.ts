/**
 * M9.4 — the unified "All" tab's per-section query derivation (PURE — no DB, no
 * request, unit-testable).
 *
 * The All tab runs the three source queries in parallel with the SHARED applicable
 * filters only (year, deal ID, text — the ones every source understands, PRD §3.1 /
 * FR-M9-02/03/06). The Collectibles-scoped filters (status, only-with-balance) do NOT
 * apply as global All-tab filters — they "remain Collectibles-scoped within their
 * section" (M9.4 deliverable): reach them by opening the Collectibles tab. Sort is
 * likewise not a global All-tab control; each section renders in its own source
 * default (Rule 7), so a section query always carries `sort: "default"`.
 *
 * `parseSearchQuery` already drops status/only_with_balance for any non-Collectibles
 * source, so an All-tab query arrives with them null/false; `buildSectionQuery`
 * re-asserts that anyway so a hand-crafted object can never leak a Collectibles filter
 * into a section.
 */
import type { SearchQuery, SearchSource } from "./types";
import { ALL_TAB_SECTION_LIMIT, SEARCH_SECTIONS } from "./types";

/**
 * The concrete, single-source query for one All-tab section. Keeps the shared filters
 * (year, deal_code, text) verbatim — the Rule-3 year asymmetry is applied per source
 * downstream (booked year for Deals/Collectibles, paid year for Payments), exactly as
 * the single-source tabs do. `pageSize` defaults to the section preview cap; the
 * export pager overrides it to page the full set.
 */
export function buildSectionQuery(
  query: SearchQuery,
  source: SearchSource,
  pageSize: number = ALL_TAB_SECTION_LIMIT
): SearchQuery {
  return {
    source,
    year: query.year,
    dealCode: query.dealCode,
    text: query.text,
    // Collectibles-scoped filters never apply as global All-tab filters (M9.4).
    status: null,
    onlyWithBalance: false,
    // Each section renders in its source default order (Rule 7).
    sort: "default",
    page: 1,
    pageSize,
  };
}

/** The three section queries in §3.2 order, for parallel orchestration. */
export function allSectionQueries(
  query: SearchQuery,
  pageSize?: number
): { source: SearchSource; query: SearchQuery }[] {
  return SEARCH_SECTIONS.map((source) => ({
    source,
    query: buildSectionQuery(query, source, pageSize),
  }));
}
