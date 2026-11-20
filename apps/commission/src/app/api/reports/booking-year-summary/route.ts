import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getBookingYearSummary } from "@/lib/reports/queries";

/**
 * GET /api/reports/booking-year-summary — Report 5 (§3.6), the Booking-Year Summary:
 * per booking year Deals / GCI (Net of VAT) / Collected / Outstanding / Written-off.
 * All-time (no year param). Outstanding is open balances only, with Cancelled deals'
 * write-offs split into their own column (the OQ4 default, master PRD Q18 "Split,
 * flagged as sheet departure").
 *
 * Demo (M8.2): GET /api/reports/booking-year-summary → row 2026 =
 * 21 deals / ₱6,688,497.25 / ₱1,908,192.86 / ₱4,855,304.39 / ₱0.00.
 *
 * GET-only (405 on writes, AC12); auth-first through getWorkspaceContext (RLS scopes
 * the read to the caller, AC9); decimal-safe. See the cash-per-year route for the
 * full rationale.
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

  const report = await getBookingYearSummary();
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
