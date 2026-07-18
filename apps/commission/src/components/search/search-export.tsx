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
import { DEFAULT_PAGE_SIZE, type SearchQuery } from "@/lib/search/types";

/**
 * M9.3 — the Search Console's CSV/XLSX export pair (FR-M9-11, §6 "Export button on
 * the table header, disabled at zero rows"). Two links, not a fetch: a download is
 * a navigation the browser performs, and the server route (/api/export/search)
 * streams the filtered/sorted set carrying the current SearchQuery — so the file is
 * exactly what is on screen across all pages (AC11), with zero client-side money
 * math or row assembly.
 *
 * The href drops page/page_size (the export is every matching row, not the visible
 * page) and rides the same `serializeSearchQuery` the URL uses, so filename +
 * contents always match the active search.
 *
 * DISABLED AT ZERO ROWS (§6): the buttons render disabled with a tooltip rather than
 * vanishing, so the affordance stays discoverable — there is simply nothing to pull
 * until a filter matches.
 */
export function SearchExport({
  query,
  disabled,
}: {
  query: SearchQuery;
  disabled: boolean;
}) {
  // Reset pagination so page/page_size never leak into the export URL — the file is
  // all matching rows regardless of which page the screen is on.
  const params = serializeSearchQuery({ ...query, page: 1, pageSize: DEFAULT_PAGE_SIZE });

  if (disabled) {
    return (
      <div className="flex gap-2" data-testid="search-export">
        {(["csv", "xlsx"] as const).map((format) => (
          <Tooltip key={format}>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  data-testid={`export-search-${format}`}
                  aria-label={`Export search results as ${format.toUpperCase()} (nothing to export)`}
                >
                  <Download className="size-4" /> {format.toUpperCase()}
                </Button>
              }
            />
            <TooltipContent>Nothing to export.</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2" data-testid="search-export">
      {(["csv", "xlsx"] as const).map((format) => (
        <Button
          key={format}
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={searchExportPath(params, format)} />}
          data-testid={`export-search-${format}`}
          aria-label={`Export search results as ${format.toUpperCase()}`}
        >
          <Download className="size-4" /> {format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
