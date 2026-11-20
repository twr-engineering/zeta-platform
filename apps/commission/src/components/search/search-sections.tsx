"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { serializeSearchQuery } from "@/lib/search/params";
import { buildSectionQuery } from "@/lib/search/sections";
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_SECTIONS,
  type AllSearchResult,
  type SearchQuery,
  type SearchResult,
  type SearchSource,
} from "@/lib/search/types";
import { SearchResults } from "./search-results";

/**
 * M9.4 — the unified "All" tab's grouped sections (Rule 2): the three §3.2 projections
 * on one screen, never merged. Each section keeps its own columns, count, default sort,
 * and empty state; a "View all in <tab>" link carries the shared filters (year, deal
 * ID, text) into the single-source tab for the full, paged, sortable set.
 *
 * The Rule-3 year asymmetry is made visible per section, not hidden: Deals and
 * Collectibles carry a "by year booked" basis, Payments "by year paid" — so a single
 * "Year" control on the All tab reads correctly in every section (the `data-year-basis`
 * attribute pins it for tests).
 *
 * Rows carry `data-search-row-link` (via SearchResults), so the parent console's
 * arrow/Enter keyboard nav walks every row across all three sections seamlessly.
 */

const SECTION_META: Record<
  SearchSource,
  { label: string; basis: "booked" | "paid"; basisLabel: string }
> = {
  deals: { label: "Deals", basis: "booked", basisLabel: "by year booked" },
  collectibles: { label: "Collectibles", basis: "booked", basisLabel: "by year booked" },
  payments: { label: "Payments", basis: "paid", basisLabel: "by year paid" },
};

export function SearchSections({
  query,
  allResult,
}: {
  query: SearchQuery;
  allResult: AllSearchResult;
}) {
  const pathname = usePathname();
  const bySource: Record<SearchSource, SearchResult> = {
    deals: allResult.deals,
    collectibles: allResult.collectibles,
    payments: allResult.payments,
  };

  return (
    <div className="space-y-6">
      {SEARCH_SECTIONS.map((source) => {
        const result = bySource[source];
        const meta = SECTION_META[source];
        const isEmpty = result.total === 0;
        const capped = result.total > result.rows.length;
        // The single-source tab, pre-filtered to the shared filters, for the full set.
        const viewAllHref = `${pathname}?${serializeSearchQuery(
          buildSectionQuery(query, source, DEFAULT_PAGE_SIZE)
        ).toString()}`;

        return (
          <section
            key={source}
            data-testid={`search-section-${source}`}
            data-year-basis={meta.basis}
            className="space-y-2"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-1.5">
              <div className="flex items-baseline gap-2">
                <h2 className="font-heading text-lg font-semibold tracking-tight">
                  {meta.label}
                </h2>
                <span
                  className="text-xs text-muted-foreground"
                  data-testid={`search-section-${source}-basis`}
                >
                  {meta.basisLabel}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="text-sm text-muted-foreground"
                  data-testid={`search-section-${source}-count`}
                >
                  {result.total} matching {result.total === 1 ? "record" : "records"}
                </span>
                {!isEmpty && (
                  <Link
                    href={viewAllHref}
                    scroll={false}
                    data-testid={`search-section-${source}-viewall`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {capped ? `View all ${result.total} in ${meta.label}` : `Open in ${meta.label} tab`} →
                  </Link>
                )}
              </div>
            </header>

            {isEmpty ? (
              <p
                className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
                data-testid={`search-section-${source}-empty`}
              >
                {/* Verbatim per-section empty state — do not reword (Rule 8 / AC9). */}
                {result.emptyMessage}
              </p>
            ) : (
              <SearchResults result={result} />
            )}
          </section>
        );
      })}
    </div>
  );
}
