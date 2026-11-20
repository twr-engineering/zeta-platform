import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { manilaToday } from "@/lib/date/manila";
import { isExportDataset, loadExportDataset } from "@/lib/export/datasets";
import {
  EXPORT_CONTENT_TYPES,
  exportFilename,
  isExportFormat,
  toCsv,
  toXlsxRows,
  xlsxColumnWidths,
} from "@/lib/export/format";

/**
 * The download endpoint behind every Export button (FR-M0-09, AC8).
 *
 * A ROUTE HANDLER, NOT A SERVER ACTION, and that is forced rather than chosen: a
 * download is a navigation the browser has to perform — it needs a real response
 * carrying Content-Disposition. A server action can only hand bytes back to
 * JavaScript, which would then have to build a Blob and fake a click, and that
 * whole contraption stops working the moment JS does not.
 *
 * AUTH IS THE FIRST THING THAT HAPPENS. FR-M0-01: "server enforces auth on every
 * API route". The middleware already gates this path (it is not public, so a
 * signed-out request is redirected to /login before arriving) — the check below
 * is the one that does not depend on a matcher pattern staying correct, and it
 * is the reason this route is safe on its own terms. getWorkspaceContext() calls
 * auth.getUser(), which revalidates the JWT with Supabase rather than trusting a
 * cookie; the queries then run through RLS with the caller's own token, so an
 * authenticated agent cannot export another agent's list either (AC9).
 *
 * Note what is NOT here: no workspace id in the URL, no id in a query parameter.
 * There is nothing to tamper with.
 */

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ dataset: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { dataset } = await context.params;

  const workspace = await getWorkspaceContext();
  if (!workspace) {
    // 401, not a redirect to /login: this URL is fetched as a download, and a
    // login page arriving as "lead-sources.csv" would be a baffling file.
    return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  }

  if (!isExportDataset(dataset)) {
    return NextResponse.json({ error: `Unknown export: ${dataset}` }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "csv";
  if (!isExportFormat(format)) {
    return NextResponse.json(
      { error: `Unknown format: ${format}. Use csv or xlsx.` },
      { status: 400 }
    );
  }

  // The deal / receivables list view filters ride along so the download matches
  // the screen (AC8). Each dataset reads only the filters it understands.
  const yearParam = params.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const archived = params.get("archived") === "true";
  const statusParam = params.get("status");
  const status =
    statusParam === "open" || statusParam === "closed" || statusParam === "cancelled"
      ? statusParam
      : undefined;
  const developerId = params.get("developer") ?? undefined;
  const hasBalance = params.get("hasBalance") === "true";
  const overridden = params.get("overridden") === "true";
  const text = params.get("q") ?? undefined;
  // Payments list (FR-M5-11): month_paid + payment_type ride along too.
  const monthParam = params.get("month");
  const month =
    monthParam && /^\d{1,2}$/.test(monthParam) && Number(monthParam) >= 1 && Number(monthParam) <= 12
      ? Number(monthParam)
      : undefined;
  const typeParam = params.get("type");
  const paymentType =
    typeParam === "commission" || typeParam === "incentive" ? typeParam : undefined;
  // M6 dashboard drill-down filters (FR-M6-12) so a drilled-in list's download
  // still matches the screen (AC8). Each dataset reads only the ones it owns.
  const bucketParam = params.get("bucket");
  const bucket =
    bucketParam === "lt1" || bucketParam === "m1to3" || bucketParam === "m3to6" || bucketParam === "m6plus"
      ? bucketParam
      : undefined;
  const overpaid = params.get("overpaid") === "true";
  const varianceOverTolerance = params.get("variance") === "over-tolerance";
  const stale = params.get("stale") === "true";
  const referralUnpaid = params.get("referral") === "unpaid";
  // Yield Summary segment drill-through (FR-M2-12) — the deals export ties to the row.
  const segmentParam = params.get("segment");
  const segment =
    segmentParam === "resale" ||
    segmentParam === "developer" ||
    segmentParam === "sales" ||
    segmentParam === "rental" ||
    segmentParam === "referral"
      ? segmentParam
      : undefined;
  // Source Performance drill-through (FR-M7-09) — a lead_source_id filtering the deals
  // export to one source; ignored by every dataset but "deals".
  const source = params.get("source") ?? undefined;
  // M8 vintage-matrix value toggle (FR-M8-04) — the export ties to the on-screen view.
  const valueParam = params.get("value");
  const matrixValue =
    valueParam === "net_of_vat" || valueParam === "net_cash" ? valueParam : undefined;

  const data = await loadExportDataset(dataset, {
    year,
    archived,
    status,
    developerId,
    hasBalance,
    overridden,
    text,
    month,
    paymentType,
    bucket,
    overpaid,
    varianceOverTolerance,
    stale,
    referralUnpaid,
    segment,
    source,
    matrixValue,
  });
  const filename = exportFilename(data.name, format, manilaToday());

  // Lightweight export access log (M8 §8 Auditability — "exports MAY be access-logged:
  // workspace, user, report, timestamp — lightweight, not part of the financial audit
  // trail"). A structured server-side line, never a DB write: it records who pulled which
  // report as what, so an export can be traced without touching the audit ledger. Covers
  // every dataset, not just M8's, at zero storage cost.
  console.info(
    JSON.stringify({
      event: "export.access",
      workspace: workspace.workspace.id,
      user: workspace.email,
      dataset: data.name,
      format,
      at: new Date().toISOString(),
    })
  );

  const body: Buffer | string =
    format === "csv"
      ? toCsv(data)
      : await writeXlsxFile(toXlsxRows(data), {
          columns: xlsxColumnWidths(data),
          sheet: data.sheet,
        }).toBuffer();

  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": EXPORT_CONTENT_TYPES[format],
      // Quoted: the filename carries no spaces today, but a dataset name that
      // grows one should not silently truncate the download.
      "Content-Disposition": `attachment; filename="${filename}"`,
      // An export is a snapshot of live data. A cached one is a wrong one.
      "Cache-Control": "no-store",
    },
  });
}
