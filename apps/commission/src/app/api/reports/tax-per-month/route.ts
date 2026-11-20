import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getTaxPerMonth } from "@/lib/reports/queries";
import { parseYearParam } from "@/lib/reports/params";

/**
 * GET /api/reports/tax-per-month?year=YYYY — Report 4 (§3.5), Tax Collected per Month
 * for the selected paid year (default: current Manila year, rule 3) — the agent's
 * monthly accountant pull. Always twelve month rows (rule 4).
 *
 * Demo (M8.1): GET /api/reports/tax-per-month?year=2026 → the July row shows Output
 * VAT ₱5,357.14 and EWT ₱4,464.29 — exactly D021's incentive-release split.
 *
 * GET-only (405 on writes, AC12); auth-first through getWorkspaceContext (RLS scopes
 * the read to the caller, AC9); decimal-safe. See the cash-per-year route for the
 * full rationale.
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

  const report = await getTaxPerMonth(parsed.year);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
