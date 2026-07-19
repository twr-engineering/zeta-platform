/**
 * M10.1 — the help-content bundle API (FR-M10-17).
 *
 * READ-ONLY: only GET is exported, so every write verb is a 405 automatically —
 * content is never written through the app (rule 11; the DB has no write policy).
 * The client HelpContentProvider is seeded server-side from the layout, then
 * revalidates against this route so a republished bundle propagates to a long-lived
 * session within the cache TTL (< 5 min) without a reload. Money is never involved.
 */
import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getActiveContentBundle } from "@/lib/help/loader";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    return NextResponse.json(
      { error: "Sign in to load help content." },
      { status: 401 }
    );
  }

  const bundle = await getActiveContentBundle();
  return NextResponse.json(bundle, {
    // Let the browser reuse the bundle for the TTL; content is product-level so it
    // is fine to cache privately.
    headers: { "Cache-Control": "private, max-age=240" },
  });
}
