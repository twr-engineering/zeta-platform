import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getMonthlyCashFlow } from "@/lib/reports/queries";
import { parseYearParam } from "@/lib/reports/params";

/**
 * GET /api/reports/monthly-cash-flow?year=YYYY — Report 3 (§3.4), Monthly Cash Flow
 * for the selected paid year (default: current Manila year, rule 3). Always twelve
 * month rows (rule 4).
 *
 * GET-only (405 on writes, AC12); auth-first through getWorkspaceContext (RLS scopes
 * the read to the caller, AC9); decimal-safe (money fields are already strings). See
 * the cash-per-year route for the full rationale.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    return NextResponse.json(
      { error: "Sign in to read your reports." },
      { status: 401 }
    );
  }

  const parsed = parseYearParam(new URL(request.url).searchParams.get("year"));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const report = await getMonthlyCashFlow(parsed.year);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
