import type { Metadata } from "next";

import { SearchConsole } from "@/components/search/search-console";
import { getSearchFilterOptions } from "@/lib/search/filter-options";
import { parseSearchQuery } from "@/lib/search/params";
import { runSearch } from "@/lib/search/queries";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

/**
 * M9.2 — the Search Console screen (§6). A pure read layer: the URL is parsed into a
 * SearchQuery, the indexed workspace-scoped query runs server-side (auth + RLS via
 * the app-group layout), and the result page + the filter-bar option sets are handed
 * to the client console. Every filter change re-navigates the URL, which re-renders
 * this server component — there is no client-side money math (§3.2) and no write path
 * anywhere on the screen (Rule 1).
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value[0] !== undefined) urlParams.set(key, value[0]);
    } else if (value !== undefined) {
      urlParams.set(key, value);
    }
  }

  const { query, textTruncated } = parseSearchQuery(urlParams);

  const [result, filterOptions] = await Promise.all([
    runSearch(query),
    getSearchFilterOptions(),
  ]);

  return (
    <SearchConsole
      query={query}
      result={result}
      textTruncated={textTruncated}
      years={filterOptions.years}
      dealOptions={filterOptions.deals}
    />
  );
}
