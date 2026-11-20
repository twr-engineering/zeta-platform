import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/date/manila";
import {
  CSV_BOM,
  CSV_EOL,
  EXPORT_CONTENT_TYPES,
  exportFilename,
  isExportFormat,
  toCsvBodyRow,
  toCsvHeaderRow,
  toXlsxRows,
  xlsxColumnWidths,
} from "@/lib/export/format";
import { parseSearchQuery } from "@/lib/search/params";
import { runSearch } from "@/lib/search/queries";
import { buildSectionQuery } from "@/lib/search/sections";
import { searchExportName, searchExportSpec } from "@/lib/search/export-columns";
import {
  SEARCH_SECTIONS,
  type SearchQuery,
  type SearchResultRow,
  type SearchSource,
} from "@/lib/search/types";

/**
 * M9.3 — the Search Console's filtered-result export (FR-M9-11, AC11; §8).
 *
 * A DEDICATED route, not a new entry in the buffered `/api/export/[dataset]`
 * registry, and that is a considered call (M9 §8 "streams — no full
 * materialization"):
 *
 *   • The registry's `loadExportDataset` fully materializes a list's rows and its
 *     loaders take `DealExportFilters`; the search set is filter-parameterized by
 *     the whole `SearchQuery` (year asymmetry, normalized text, status/balance,
 *     sort matrix) and its columns are the §3.2 projection, not the M1/M4/M5 list
 *     columns. Threading `SearchQuery` through the registry would fork it; a source
 *     route that reuses the same `runSearch` the screen uses is cleaner and keeps
 *     the download tied to the screen (AC11).
 *   • CSV genuinely STREAMS: the response is a ReadableStream that emits the header,
 *     then pages the source RPC in bounded batches and flushes each batch's rows as
 *     they arrive — peak memory is one batch (~a few hundred KB at 1k rows), never
 *     the whole set, so an uncapped result set (OQ4 default = no cap) cannot blow
 *     the heap.
 *   • XLSX is BUFFERED, because the format demands it: `write-excel-file` builds a
 *     zip whose central directory needs every row before the first byte — there is
 *     no streaming XLSX. It is still fed from the SAME bounded batch pager, so the
 *     DB is never asked for an unbounded single result; the peak is the row array
 *     (~1–2 MB at the 2,000-row design target, PRD §8), well within limits. The
 *     perf harness (scripts/perf-search.ts) proves the 2,000-row assembly < 10 s.
 *
 * READ-ONLY at the route layer (FR-M9-14): only GET is exported, so Next answers
 * every write verb with 405 — the guarantee is the absence of write handlers, not
 * UI omission. Auth is revalidated via getWorkspaceContext (getUser, never
 * getSession); the query runs through `runSearch`'s workspace-scoped, RLS-bound
 * RPC with the caller's own JWT, so an agent can only ever export their own rows
 * (AC9) — there is no workspace id in the URL to tamper with.
 */

export const dynamic = "force-dynamic";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Bounded page size for the export pager. Large enough that a 2,000-row export is
// two round-trips, small enough that the streamed CSV's peak memory is one batch.
// Capped at MAX_PAGE_SIZE's sibling scale — the RPC's own limit clamp handles the rest.
const EXPORT_BATCH = 1000;

/**
 * Page `runSearch` over the FULL matching set (all pages — FR-M9-11), yielding one
 * batch of rows at a time. Deterministic sort + tie-breaks (Rule 7) make OFFSET
 * paging stable; freshness is a point-in-time snapshot per statement (staleness
 * < 5 s, Rule 16), which an export tolerates. Stops when a short batch or the
 * window total says the set is drained.
 */
async function* pageSearchRows(
  query: SearchQuery,
  client: SupabaseServerClient
): AsyncGenerator<SearchResultRow[]> {
  let page = 1;
  let seen = 0;
  for (;;) {
    const result = await runSearch(
      { ...query, page, pageSize: EXPORT_BATCH },
      client
    );
    if (result.rows.length === 0) return;
    yield result.rows as SearchResultRow[];
    seen += result.rows.length;
    if (result.rows.length < EXPORT_BATCH || seen >= result.total) return;
    page += 1;
  }
}

export async function GET(request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    // 401, not a redirect: this URL is fetched as a download; a login page
    // arriving as "search-deals.csv" would be a baffling file.
    return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  }

  const url = new URL(request.url);
  // page/page_size on the URL are the screen's pagination; the export is every
  // matching row, so `pageSearchRows` owns pagination and those are ignored here.
  const { query } = parseSearchQuery(url.searchParams);

  const format = url.searchParams.get("format") ?? "csv";
  if (!isExportFormat(format)) {
    return NextResponse.json(
      { error: `Unknown format: ${format}. Use csv or xlsx.` },
      { status: 400 }
    );
  }

  // The unified "All" tab (M9.4) carries three different §3.2 column sets, so a single
  // CSV can't represent it (Rule 2 — never a merged column set). The combined export is
  // one multi-sheet XLSX workbook; each section's CSV is a separate request with a
  // concrete source. A hand-crafted all+csv (the UI never issues it) is a clean 400.
  if (query.source === "all" && format !== "xlsx") {
    return NextResponse.json(
      {
        error:
          "The All tab exports one CSV per section — request each section's CSV, or use XLSX for the combined workbook.",
      },
      { status: 400 }
    );
  }

  const filename = exportFilename(searchExportName(query), format, manilaToday());

  // A request-scoped client, revalidated above, reused across every batch so the
  // RPC resolves the same workspace from the JWT each time (RLS is the boundary).
  const client = await createClient();

  // Lightweight export access log (M8 §8 Auditability — workspace, user, dataset,
  // format, timestamp; a structured server line, never a DB write, not the M0
  // financial audit trail). Mirrors the registry route so every export is traceable.
  console.info(
    JSON.stringify({
      event: "export.access",
      workspace: workspace.workspace.id,
      user: workspace.email,
      dataset: searchExportName(query),
      format,
      at: new Date().toISOString(),
    })
  );

  const headers = {
    "Content-Type": EXPORT_CONTENT_TYPES[format],
    "Content-Disposition": `attachment; filename="${filename}"`,
    // An export is a snapshot of live data. A cached one is a wrong one.
    "Cache-Control": "no-store",
  };

  // --- Unified "All" tab (M9.4): one XLSX workbook, three §3.2 sheets. -------
  // Each sheet is fed from the SAME bounded pager as the single-source export, so no
  // section is ever asked for an unbounded single result; the three run in sequence
  // over the one RLS-bound client. XLSX only (the all+csv guard above rejects the rest).
  if (query.source === "all") {
    const sheetsData = [];
    for (const source of SEARCH_SECTIONS) {
      const spec = searchExportSpec(source);
      const rows: SearchResultRow[] = [];
      for await (const batch of pageSearchRows(buildSectionQuery(query, source), client)) {
        rows.push(...batch);
      }
      const dataset = { name: spec.sheet, sheet: spec.sheet, columns: spec.columns, rows };
      sheetsData.push({
        data: toXlsxRows(dataset),
        columns: xlsxColumnWidths(dataset),
        sheet: spec.sheet,
      });
    }
    // write-excel-file multi-sheet form: an array of { data, sheet, columns } objects.
    const buffer = await writeXlsxFile(sheetsData).toBuffer();
    return new NextResponse(buffer as BodyInit, { headers });
  }

  // --- Single source: the one on-screen §3.2 projection. --------------------
  // `query.source` is concrete here (the all case returned above).
  const { sheet, columns } = searchExportSpec(query.source as SearchSource);

  if (format === "csv") {
    // Stream: BOM + header first, then each batch's rows flushed as they arrive.
    // An empty result set streams a header-only file (a valid, empty CSV — the UI
    // disables the button at zero rows, §6, but a direct hit must not error).
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(CSV_BOM + toCsvHeaderRow(columns) + CSV_EOL));
          for await (const batch of pageSearchRows(query, client)) {
            let chunk = "";
            for (const row of batch) chunk += toCsvBodyRow(columns, row) + CSV_EOL;
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return new NextResponse(stream, { headers });
  }

  // XLSX — buffered from the same bounded pager (see the header note). An empty set
  // yields a valid header-only sheet.
  const rows: SearchResultRow[] = [];
  for await (const batch of pageSearchRows(query, client)) rows.push(...batch);
  const buffer = await writeXlsxFile(toXlsxRows({ name: sheet, sheet, columns, rows }), {
    columns: xlsxColumnWidths({ name: sheet, sheet, columns, rows }),
    sheet,
  }).toBuffer();

  return new NextResponse(buffer as BodyInit, { headers });
}
