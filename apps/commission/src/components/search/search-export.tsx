"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { serializeSearchQuery } from "@/lib/search/params";
import { searchExportPath } from "@/lib/routes";
import { buildSectionQuery } from "@/lib/search/sections";
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_SECTIONS,
  type SearchQuery,
  type SearchSource,
} from "@/lib/search/types";

/**
 * M9.3/M9.4 — the Search Console's export controls (FR-M9-11, §6 "Export button on the
 * table header, disabled at zero rows"). Downloads are navigations the browser
 * performs, not fetches, so each control is a link (or a disabled button + tooltip);
 * the server route (/api/export/search) streams the filtered/sorted set carrying the
 * current SearchQuery — the file is exactly what's on screen across all pages (AC11),
 * with zero client-side money math or row assembly. The href drops page/page_size so
 * the file is every matching row, not the visible page.
 *
 * On the unified All tab the sources have three different §3.2 column sets, so a single
 * CSV can't hold them (Rule 2 — never a merged column set). The export therefore is:
 *   • one multi-sheet XLSX workbook (Deals · Collectibles · Payments sheets), and
 *   • one CSV per section (three separate files, per the M9.4 deliverable),
 * each disabled when its own section (or, for the workbook, all sections) is empty.
 */

/** A single download affordance — a link when live, a tooltip'd disabled button at zero. */
function DownloadButton({
  href,
  label,
  testId,
  ariaLabel,
  disabled,
  emptyHint,
}: {
  href: string;
  label: string;
  testId: string;
  ariaLabel: string;
  disabled: boolean;
  emptyHint: string;
}) {
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled
              data-testid={testId}
              aria-label={`${ariaLabel} (nothing to export)`}
            >
              <Download className="size-4" /> {label}
            </Button>
          }
        />
        <TooltipContent>{emptyHint}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<a href={href} />}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      <Download className="size-4" /> {label}
    </Button>
  );
}

const SECTION_LABEL: Record<SearchSource, string> = {
  deals: "Deals",
  collectibles: "Collectibles",
  payments: "Payments",
};

export function SearchExport({
  query,
  disabled,
  sectionCounts,
}: {
  query: SearchQuery;
  /** Single-source: true at zero rows. Ignored on the All tab (per-section counts drive it). */
  disabled: boolean;
  /** All-tab only — the per-section totals that gate each file. */
  sectionCounts?: Record<SearchSource, number>;
}) {
  // --- Unified All tab: multi-sheet workbook + one CSV per section ---
  if (query.source === "all") {
    const counts = sectionCounts ?? { deals: 0, collectibles: 0, payments: 0 };
    const grandTotal = counts.deals + counts.collectibles + counts.payments;
    // The workbook carries the whole All query (source=all) — the route fans it into
    // three sheets. page/page_size reset so the file is every matching row.
    const workbookParams = serializeSearchQuery({
      ...query,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });

    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="search-export">
        <DownloadButton
          href={searchExportPath(workbookParams, "xlsx")}
          label="XLSX (all)"
          testId="export-search-xlsx"
          ariaLabel="Export all sections as a multi-sheet XLSX workbook"
          disabled={grandTotal === 0}
          emptyHint="Nothing to export."
        />
        {SEARCH_SECTIONS.map((source) => {
          const params = serializeSearchQuery(
            buildSectionQuery(query, source, DEFAULT_PAGE_SIZE)
          );
          return (
            <DownloadButton
              key={source}
              href={searchExportPath(params, "csv")}
              label={`${SECTION_LABEL[source]} CSV`}
              testId={`export-search-csv-${source}`}
              ariaLabel={`Export the ${SECTION_LABEL[source]} section as CSV`}
              disabled={counts[source] === 0}
              emptyHint={`No ${SECTION_LABEL[source]} rows to export.`}
            />
          );
        })}
      </div>
    );
  }

  // --- Single source: the CSV/XLSX pair for the one on-screen projection ---
  const params = serializeSearchQuery({ ...query, page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div className="flex gap-2" data-testid="search-export">
      {(["csv", "xlsx"] as const).map((format) => (
        <DownloadButton
          key={format}
          href={searchExportPath(params, format)}
          label={format.toUpperCase()}
          testId={`export-search-${format}`}
          ariaLabel={`Export search results as ${format.toUpperCase()}`}
          disabled={disabled}
          emptyHint="Nothing to export."
        />
      ))}
    </div>
  );
}
