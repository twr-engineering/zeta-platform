/**
 * M9 — the Search Console query API (PRD §5 FR-M9-14, §8; Rules 1/8/9/10/13).
 *
 * READ-ONLY at the route layer: only GET is exported, so Next answers every write
 * verb (POST/PUT/PATCH/DELETE) with 405 automatically — the guarantee is enforced
 * by the absence of write handlers, not by UI omission (§8). Auth is revalidated
 * via getWorkspaceContext (getUser, never getSession); RLS scopes every row to the
 * caller's workspace (AC9). An over-constrained or unknown-code query is a 200 with
 * zero rows and the verbatim empty-state contract — never a 4xx (Rules 8/9).
 */
import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { parseSearchQuery } from "@/lib/search/params";
import { runSearch } from "@/lib/search/queries";
import { EMPTY_STATE_MESSAGE } from "@/lib/search/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    return NextResponse.json(
      { error: "Sign in to search your records." },
      { status: 401 }
    );
  }

  const { query, textTruncated } = parseSearchQuery(
    new URL(request.url).searchParams
  );

  const result = await runSearch(query);

  return NextResponse.json(
    {
      source: result.source,
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      // The verbatim message travels with every response so the UI never re-types
      // it; the client renders it when `total === 0` (Rule 8).
      emptyMessage: EMPTY_STATE_MESSAGE,
      // Rule 12 — the caller shows a "search text trimmed to 200 characters" notice.
      textTruncated,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
