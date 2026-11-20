import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getVintageMatrix } from "@/lib/reports/queries";
import { parseMatrixValueParam } from "@/lib/reports/params";

/**
 * GET /api/reports/vintage-matrix?value=net_of_vat|net_cash — Report 2 (§3.3), the
 * paid-year × booking-year collection matrix. Rows = paid years, columns = booking
 * years; the value toggle (default Net of VAT, FR-M8-04) picks which stored split the
 * cells sum. Row totals equal report 1's per-year figure for the same toggle (the
 * FR-M8-14 cross-check).
 *
 * Demo (M8.2): GET /api/reports/vintage-matrix → the single populated cell
 * (paid 2026, booked 2026) = ₱1,908,192.86; `?value=net_cash` → ₱1,909,085.71.
 *
 * GET-only (405 on writes, AC12); auth-first through getWorkspaceContext (RLS scopes
 * the read to the caller, AC9); decimal-safe. A dangling payment reference makes the
 * builder throw (rule 15) → Next answers 500 rather than silently dropping the cash.
 * See the cash-per-year route for the full rationale.
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

  const parsed = parseMatrixValueParam(new URL(request.url).searchParams.get("value"));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const report = await getVintageMatrix(parsed.value);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
