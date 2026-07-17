import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { zipSync, strToU8 } from "fflate";

import { getWorkspaceContext } from "@/lib/workspace/queries";
import { manilaToday } from "@/lib/date/manila";
import { loadWorkspaceExport, WORKSPACE_EXPORT_NAME } from "@/lib/export/datasets";
import {
  toCsv,
  toXlsxRows,
  xlsxColumnWidths,
  type ExportDataset,
} from "@/lib/export/format";

/**
 * The whole-workspace export — the "it's my data" guarantee (FR-M0-10).
 *
 * A route handler, not a server action, for the same reason as the per-list
 * export next door: a download is a browser navigation that needs a real
 * response with Content-Disposition, not bytes handed back to JavaScript.
 *
 * It is a STATIC segment beside the `[dataset]` dynamic one, so `/api/export/
 * workspace` lands here and `/api/export/property-types` still lands there —
 * Next.js resolves static segments ahead of dynamic ones.
 *
 * AUTH IS THE FIRST THING THAT HAPPENS. getWorkspaceContext() calls
 * auth.getUser(), which revalidates the JWT with Supabase; every dataset then
 * loads through RLS with the caller's own token, so the archive can only ever
 * contain the caller's own workspace (AC9). There is no id in the URL to tamper
 * with.
 *
 * One archive, every table, both formats: CSV is the exact archival copy (ties
 * to the database to the centavo), XLSX is the one the agent can open and sum.
 */

export const dynamic = "force-dynamic";

async function xlsxBuffer(data: ExportDataset<unknown>): Promise<Buffer> {
  return writeXlsxFile(toXlsxRows(data), {
    columns: xlsxColumnWidths(data),
    sheet: data.sheet,
  }).toBuffer();
}

function readme(today: string, names: readonly string[]): string {
  return [
    "ZETA GCI + Collections — full workspace export",
    `Exported: ${today} (Asia/Manila)`,
    "",
    "This archive is everything your workspace holds. It is yours to keep,",
    "move, or hand to your accountant.",
    "",
    "  csv/   — the exact archival copy. Money is unrounded and unformatted so",
    "           it reproduces the database to the centavo. Best for import.",
    "  xlsx/  — the same data as spreadsheets you can open and total in Excel.",
    "",
    "Tables in this export:",
    ...names.map((n) => `  - ${n}`),
    "",
  ].join("\n");
}

export async function GET() {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  }

  const datasets = await loadWorkspaceExport();
  const today = manilaToday();

  // Each table twice: the exact CSV and the openable XLSX, in their own folders.
  const files: Record<string, Uint8Array> = {
    "README.txt": strToU8(readme(today, datasets.map((d) => d.name))),
  };

  for (const data of datasets) {
    files[`csv/${data.name}.csv`] = strToU8(toCsv(data));
    files[`xlsx/${data.name}.xlsx`] = new Uint8Array(await xlsxBuffer(data));
  }

  // level 6 (fflate default) — CSV/XLSX are text-ish and compress well, and this
  // archive is downloaded rarely enough that a moment of CPU is worth the size.
  const zipped = zipSync(files, { level: 6 });
  const filename = `zeta-${WORKSPACE_EXPORT_NAME}-${today}.zip`;

  // Copy into a standalone ArrayBuffer: fflate's view may sit on a larger
  // pooled buffer, and handing the raw view to the response can ship trailing
  // bytes.
  const body = zipped.slice();

  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A snapshot of live data; a cached archive is a stale one.
      "Cache-Control": "no-store",
    },
  });
}
