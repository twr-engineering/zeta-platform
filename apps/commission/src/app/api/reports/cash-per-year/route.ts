import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getCashPerYear } from "@/lib/reports/queries";

/**
 * GET /api/reports/cash-per-year — Report 1 (§3.2), all-time Cash Collected per Year.
 *
 * The canonical M8 seam is the server function getCashPerYear() imported directly (no
 * JSON hop, no float risk); this route is the demo/debug surface and the door for a
 * future non-Next consumer — the exact same contract.
 *
 * GET-ONLY (FR-M8-12 / AC12). Only GET is exported, so Next answers any write verb
 * with 405 automatically — M8 has no mutation surface.
 *
 * AUTH FIRST. getWorkspaceContext() calls auth.getUser(), revalidating the JWT;
 * getCashPerYear then reads through RLS with the caller's own token, so the response
 * can only ever be the caller's own report (AC9). No id in the URL to tamper with.
 *
 * DECIMAL-SAFE: every money field is already a decimal string in the contract, so
 * NextResponse.json never turns a full-precision value into a float. A live snapshot.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    return NextResponse.json(
      { error: "Sign in to read your reports." },
      { status: 401 }
    );
  }

  const report = await getCashPerYear();
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
