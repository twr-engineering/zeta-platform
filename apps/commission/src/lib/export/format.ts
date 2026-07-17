import type { CellObject } from "write-excel-file/node";

import { toMoney } from "@/lib/money";

/**
 * The export column contract (FR-M0-09, and every export after it).
 *
 * THIS IS THE PRODUCT'S FIRST EXPORTER AND IT IS BUILT AS THE ONLY ONE. M0.4
 * exports the whole workspace, M5 the payments list, M7/M8 their reports, M9 its
 * search results — all of them are "a table, as CSV and as XLSX", and the way to
 * end up with five subtly different CSV dialects is to write the second one
 * from scratch. So a dataset declares its columns and rows; this module decides
 * what a cell looks like.
 *
 * Pure — no database, no `next` imports — so a dataset's shape can be unit
 * tested without a request.
 *
 * ── THE MONEY QUESTION, ANSWERED ONCE ──────────────────────────────────────
 *
 * Master PRD §4.3 forbids binary floats in money paths, and the whole product
 * carries decimals as exact strings for that reason (see @/lib/supabase/selects).
 * An export is where that rule meets a file format that has only doubles.
 *
 * The answer is that the two formats are for different things, so they differ:
 *
 *   CSV   → the exact stored string, unrounded and unformatted ("354591.84").
 *           CSV is the archival, machine-readable copy; it must reproduce the
 *           database to the centavo, and it can, because it is text.
 *   XLSX  → a Number carrying the #,##0.00 format, so the agent can select a
 *           column and see it sum. An agent who exports to Excel and cannot add
 *           up their own commissions has been handed a screenshot, not a
 *           spreadsheet.
 *
 * The XLSX conversion is the ONLY float this product creates, it happens at the
 * very last step before serialisation, and nothing is ever read back from it.
 * `decimal.js` does the parse (never `parseFloat`) so the value that reaches the
 * cell is the correctly-rounded double of the exact decimal, not the result of
 * whatever the string coerced to.
 *
 * M0.3's three lists carry no money at all — which is precisely why this is the
 * moment to write the rule down, rather than the moment M5 discovers it.
 */

export type ColumnType = "text" | "number" | "money" | "date" | "boolean";

export type ExportColumn<Row> = {
  /** The header cell, and the CSV's first row. */
  header: string;
  type: ColumnType;
  /**
   * The cell's value. Money and dates return the EXACT STORED STRING; the
   * formatting is this module's job, not the dataset's.
   */
  value: (row: Row) => string | number | boolean | null;
  /** XLSX column width, in characters. */
  width?: number;
};

export type ExportDataset<Row = unknown> = {
  /** Becomes the filename stem and the XLSX sheet name. */
  name: string;
  /** The sheet tab's label; Excel forbids some characters and 31+ chars. */
  sheet: string;
  columns: readonly ExportColumn<Row>[];
  rows: readonly Row[];
};

// --- CSV --------------------------------------------------------------------

/**
 * RFC 4180: quote when the value contains a comma, a quote or a newline, and
 * escape an embedded quote by doubling it.
 *
 * The leading-character guard is not paranoia about correctness — the file is
 * correct either way — it is about Excel treating a cell starting with =, +, -
 * or @ as a formula. A lead source someone named "=Referral" would execute on
 * open. Prefixing a tab keeps the text intact and inert; every spreadsheet
 * strips it on display.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;

  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

function csvValue<Row>(column: ExportColumn<Row>, row: Row): string {
  const raw = column.value(row);
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  // Money stays the exact string it arrived as: no rounding, no thousands
  // separators, no currency symbol. This is the copy that must tie to the
  // database, and "₱ 354,591.84" does not parse back.
  return String(raw);
}

export function toCsv<Row>(dataset: ExportDataset<Row>): string {
  const header = dataset.columns.map((c) => csvCell(c.header)).join(",");
  const body = dataset.rows.map((row) =>
    dataset.columns.map((c) => csvCell(csvValue(c, row))).join(",")
  );

  // CRLF per RFC 4180, and a BOM so Excel on Windows reads UTF-8 rather than
  // mangling "Sphere / Personal Network" and every ₱ in later modules.
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

// --- XLSX -------------------------------------------------------------------

/**
 * A cell, as `write-excel-file` defines it.
 *
 * Taken from the library rather than re-declared: a hand-written twin compiles
 * happily right up until it does not match, and the version that matters is the
 * one the writer actually reads. `import type` is erased at build, so this costs
 * nothing at runtime.
 *
 * Note the library has no null: an empty cell is `{}`, not `{ value: null }`.
 */
export type XlsxCell = CellObject;

/**
 * The exact decimal string → the double Excel will hold.
 *
 * Deliberately `toMoney().toNumber()` and never `parseFloat`: decimal.js parses
 * the decimal exactly and then converts once, correctly rounded. Read the header
 * of this file before changing anything here.
 */
function moneyToNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    return toMoney(trimmed).toNumber();
  } catch {
    return null;
  }
}

export function toXlsxRows<Row>(dataset: ExportDataset<Row>): XlsxCell[][] {
  const header: XlsxCell[] = dataset.columns.map((c) => ({
    value: c.header,
    fontWeight: "bold",
  }));

  const body = dataset.rows.map((row) =>
    dataset.columns.map((column): XlsxCell => {
      const raw = column.value(row);
      // An empty cell, not a zero and not the string "null": an archived_at that
      // is not set means the row is active, and a 0 in that column would be a
      // date in 1900.
      if (raw === null || raw === undefined) return {};

      switch (column.type) {
        case "money": {
          const value = moneyToNumber(String(raw));
          return value === null
            ? {}
            : { value, type: Number, format: "#,##0.00" };
        }
        case "number":
          return { value: Number(raw), type: Number };
        case "boolean":
          return { value: Boolean(raw), type: Boolean };
        case "date": {
          const date = new Date(String(raw));
          return Number.isNaN(date.getTime())
            ? { value: String(raw), type: String }
            : { value: date, type: Date, format: "yyyy-mm-dd hh:mm" };
        }
        default:
          return { value: String(raw), type: String };
      }
    })
  );

  return [header, ...body];
}

export function xlsxColumnWidths<Row>(
  dataset: ExportDataset<Row>
): { width: number }[] {
  return dataset.columns.map((c) => ({ width: c.width ?? 18 }));
}

// --- filenames --------------------------------------------------------------

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * `zeta-lead-sources-2026-07-17.csv`. Dated because an agent who exports the
 * same list twice in a month should not have to open both to tell which is
 * which — and because a downloads folder silently renaming the second one
 * "(1)" is how the wrong figures get sent to an accountant.
 */
export function exportFilename(
  name: string,
  format: ExportFormat,
  today: string
): string {
  return `zeta-${name}-${today}.${format}`;
}
