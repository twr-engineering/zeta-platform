"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { serializeSearchQuery } from "@/lib/search/params";
import {
  SEARCH_SOURCES,
  type SearchQuery,
  type SearchResult,
  type SearchSource,
  type SearchStatus,
  type SortOption,
} from "@/lib/search/types";
import type { SearchDealOption } from "@/lib/search/filter-options";
import { SearchFilterBar } from "./search-filter-bar";
import { SearchResults } from "./search-results";
import { SearchExport } from "./search-export";

/**
 * M9.2 — the Search Console screen (§6). The URL is the single source of truth:
 * the server parses it, runs the indexed query, and passes the result page in;
 * every control here writes the URL back through `serializeSearchQuery`, so a
 * shared link reproduces the exact view (FR-M9-12) and there is no client-side
 * money math or filtering — M9 renders projections, it never re-derives them.
 *
 * The only local state is the text box's keystroke buffer (debounced ≥ 250 ms
 * before it touches the URL, FR-M9-06) and the mobile Filters sheet's open flag.
 * Keyboard nav: `/` focuses the text box, ↑/↓ walk the result rows, Enter opens
 * the focused row's detail view (FR-M9-13).
 */

const SOURCE_TABS: { source: SearchSource; label: string }[] = [
  { source: "deals", label: "Deals" },
  { source: "collectibles", label: "Collectibles" },
  { source: "payments", label: "Payments" },
];

const TEXT_DEBOUNCE_MS = 300; // ≥ 250 ms (FR-M9-06)

export type SearchConsoleProps = {
  query: SearchQuery;
  result: SearchResult;
  textTruncated: boolean;
  years: number[];
  dealOptions: SearchDealOption[];
};

export function SearchConsole({
  query,
  result,
  textTruncated,
  years,
  dealOptions,
}: SearchConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Latest query in a ref so a debounced text write merges into the current URL
  // state, not the one captured when the keystroke fired.
  const queryRef = React.useRef(query);
  queryRef.current = query;

  const [isPending, startTransition] = React.useTransition();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const textRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydration marker — e2e waits for the controls to be live before interacting,
  // since a pre-hydration click on a tab/select is dropped (the payments pattern).
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  // The live text buffer; resynced whenever the URL's text changes under it
  // (Clear filters, back/forward, a shared link).
  const [textBuf, setTextBuf] = React.useState(query.text);
  React.useEffect(() => setTextBuf(query.text), [query.text]);

  const navigate = React.useCallback(
    (patch: Partial<SearchQuery>) => {
      const next: SearchQuery = { ...queryRef.current, ...patch };
      if (!("page" in patch)) next.page = 1;
      const params = serializeSearchQuery(next);
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [router, pathname]
  );

  const onText = React.useCallback(
    (value: string) => {
      setTextBuf(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => navigate({ text: value }), TEXT_DEBOUNCE_MS);
    },
    [navigate]
  );

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Switching source keeps the applicable filters (year, deal ID, text) and clears
  // the inapplicable ones (status, balance) plus resets sort to the source default
  // and page to 1 (§6).
  const switchSource = React.useCallback(
    (source: SearchSource) => {
      navigate({ source, status: null, onlyWithBalance: false, sort: "default", page: 1 });
    },
    [navigate]
  );

  // `/` focuses the text box unless the user is already typing somewhere (FR-M9-13).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable)
        return;
      e.preventDefault();
      textRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ↑/↓ walk the result rows; Enter is native on the focused row link (FR-M9-13).
  const onResultsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = Array.from(
      e.currentTarget.querySelectorAll<HTMLAnchorElement>("a[data-search-row-link]")
    );
    if (links.length === 0) return;
    e.preventDefault();
    const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
    const nextIdx =
      e.key === "ArrowDown"
        ? idx < 0
          ? 0
          : Math.min(idx + 1, links.length - 1)
        : idx < 0
          ? 0
          : Math.max(idx - 1, 0);
    links[nextIdx]?.focus();
  };

  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const isEmpty = result.total === 0;

  const activeFilterCount =
    (query.year !== null ? 1 : 0) +
    (query.dealCode ? 1 : 0) +
    (query.status ? 1 : 0) +
    (query.onlyWithBalance ? 1 : 0) +
    (query.text.length > 0 ? 1 : 0) +
    (query.sort !== "default" ? 1 : 0);

  // Shared handlers for both filter-bar instances.
  const filterProps = {
    source: query.source,
    year: query.year,
    dealCode: query.dealCode,
    status: query.status,
    onlyWithBalance: query.onlyWithBalance,
    text: textBuf,
    sort: query.sort,
    years,
    dealOptions,
    onYear: (year: number | null) => navigate({ year }),
    onDealCode: (dealCode: string | null) => navigate({ dealCode }),
    onStatus: (status: SearchStatus | null) => navigate({ status }),
    onOnlyWithBalance: (onlyWithBalance: boolean) => navigate({ onlyWithBalance }),
    onText,
    onSort: (sort: SortOption) => navigate({ sort }),
  };

  const clearHref = `${pathname}?${serializeSearchQuery({
    ...query,
    year: null,
    dealCode: null,
    status: null,
    onlyWithBalance: false,
    text: "",
    sort: "default",
    page: 1,
  }).toString()}`;

  return (
    <div className="space-y-5" data-testid="search-console" data-hydrated={hydrated ? "true" : "false"}>
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Search</h1>
        {/* Read-only affordance — the sheet's own promise, preserved (§6). */}
        <p className="text-sm text-muted-foreground" data-testid="search-readonly-caption">
          Search is read-only — nothing here changes your data.
        </p>
      </header>

      {/* Source tabs — one source at a time (Rule 2). */}
      <nav aria-label="Search source" className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6" data-testid="search-tabs">
        <ul className="flex min-w-max gap-1 border-b">
          {SOURCE_TABS.map((tab) => {
            const active = query.source === tab.source;
            return (
              <li key={tab.source}>
                <button
                  type="button"
                  onClick={() => switchSource(tab.source)}
                  aria-current={active ? "page" : undefined}
                  data-testid={`search-tab-${tab.source}`}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "-mb-px inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop filter bar. */}
      <div className="hidden rounded-xl border bg-muted/30 p-4 md:block">
        <SearchFilterBar {...filterProps} textRef={textRef} instanceId="flt" withTestIds />
      </div>

      {/* Mobile: a Filters sheet with an active-filter count badge (§6). */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" size="sm" data-testid="search-filters-trigger">
                <SlidersHorizontal className="size-4" /> Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1" data-testid="search-filter-count">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <SheetContent side="left" className="w-80 max-w-[90vw] overflow-y-auto p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="text-sm">Filters</SheetTitle>
            </SheetHeader>
            <div className="p-4">
              <SearchFilterBar {...filterProps} instanceId="mflt" stacked />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {textTruncated && (
        <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="search-text-truncated">
          Search text was trimmed to 200 characters.
        </p>
      )}

      {/* Table header: count readout (§6, FR-M9-08) + export pair (FR-M9-11).
          Export is disabled at zero rows (§6) — the whole filtered/sorted set, not
          the visible page, streamed by /api/export/search. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="search-count">
          {result.total} matching {result.total === 1 ? "record" : "records"}
        </p>
        <SearchExport query={query} disabled={isEmpty} />
      </div>

      {/* Results / empty state. */}
      <div
        onKeyDown={onResultsKeyDown}
        aria-busy={isPending}
        className={cn("min-h-40 transition-opacity", isPending && "opacity-50")}
        data-testid="search-results"
      >
        {isEmpty ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center"
            data-testid="search-empty"
          >
            {/* Verbatim — do not reword (Rule 8 / AC9). */}
            <p className="text-sm text-muted-foreground" data-testid="search-empty-message">
              {result.emptyMessage}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              nativeButton={false}
              render={<Link href={clearHref} scroll={false} />}
              data-testid="search-clear-filters"
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <SearchResults result={result} />
        )}
      </div>

      {/* Pagination (§6, FR-M9-08). */}
      {!isEmpty && pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={result.page <= 1}
            onClick={() => navigate({ page: result.page - 1 })}
            data-testid="search-page-prev"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="search-page-indicator">
            Page {result.page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={result.page >= pageCount}
            onClick={() => navigate({ page: result.page + 1 })}
            data-testid="search-page-next"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// re-exported for the tab list order assertion in tests
export { SEARCH_SOURCES };
