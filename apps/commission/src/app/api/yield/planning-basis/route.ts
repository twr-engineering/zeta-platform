import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getPlanningBasis } from "@/lib/yield/planning-basis";

/**
 * GET /api/yield/planning-basis — the versioned PlanningBasis (PRD §3.4) over HTTP.
 *
 * The canonical M3 seam is the server function `getPlanningBasis()` imported
 * directly (no JSON hop, no float risk). This route is the demo/debug surface (the
 * milestone's "GET the planning basis") and the door for any future non-Next
 * consumer — it returns the exact same contract.
 *
 * AUTH FIRST. getWorkspaceContext() calls auth.getUser(), revalidating the JWT with
 * Supabase; getPlanningBasis then reads through RLS with the caller's own token, so
 * the response can only ever be the caller's own basis (AC9). There is no id in the
 * URL to tamper with.
 *
 * DECIMAL-SAFE BY CONSTRUCTION: every money/ratio field is already a decimal string
 * in the contract, so NextResponse.json never turns a full-precision value into an
 * IEEE-754 float (Rule 7). A live snapshot — no-store, never a cached basis.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    return NextResponse.json(
      { error: "Sign in to read the planning basis." },
      { status: 401 }
    );
  }

  const basis = await getPlanningBasis();
  return NextResponse.json(basis, {
    headers: { "Cache-Control": "no-store" },
  });
}
