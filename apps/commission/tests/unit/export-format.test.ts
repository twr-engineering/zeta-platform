import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  exportFilename,
  isExportFormat,
  toCsv,
  toXlsxRows,
  xlsxColumnWidths,
  type ExportDataset,
} from "@/lib/export/format";

/**
 * The cross-cutting exporter (FR-M0-09, AC8), tested where it is riskiest.
 *
 * M0.3's own lists carry no money — which is exactly why the money rules are
 * pinned here now, before M5's payments and M8's reports arrive and inherit
 * whatever this file happens to do.
 */

type Row = { name: string; amount: string; count: number; active: boolean; at: string | null };

const dataset = (rows: Row[]): ExportDataset<Row> => ({
  name: "test",
  sheet: "Test",
  columns: [
    { header: "Name", type: "text", value: (r) => r.name },
    { header: "Amount", type: "money", value: (r) => r.amount },
    { header: "Count", type: "number", value: (r) => r.count },
    { header: "Active", type: "boolean", value: (r) => r.active },
    { header: "At", type: "date", value: (r) => r.at },
  ],
  rows,
});

const row = (over: Partial<Row> = {}): Row => ({
  name: "Condo",
  amount: "354591.84",
  count: 3,
  active: true,
  at: null,
  ...over,
});

test("CSV carries the header and one line per row", () => {
  const csv = toCsv(dataset([row()]));
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "Name,Amount,Count,Active,At");
});

test("CSV reproduces money as the EXACT stored string", () => {
  // The archival copy must tie to the database to the centavo: no rounding, no
  // thousands separators, no ₱ — "₱ 354,591.84" does not parse back.
  const csv = toCsv(dataset([row({ amount: "354591.84" })]));
  assert.match(csv, /,354591\.84,/);
  assert.doesNotMatch(csv, /₱/);
  assert.doesNotMatch(csv, /354,591/);
});

test("CSV preserves trailing-zero scale, which a float would drop", () => {
  const csv = toCsv(dataset([row({ amount: "3600000.00" })]));
  assert.match(csv, /,3600000\.00,/);
});

test("CSV quotes and escapes commas, quotes and newlines (RFC 4180)", () => {
  const csv = toCsv(dataset([row({ name: 'Smith, John "JD"' })]));
  assert.match(csv, /"Smith, John ""JD"""/);

  const multiline = toCsv(dataset([row({ name: "Line1\nLine2" })]));
  assert.match(multiline, /"Line1\nLine2"/);
});

test("CSV neutralises formula injection", () => {
  // A lead source named "=Referral" must not execute when the agent opens the
  // file. The tab prefix keeps the text intact and inert.
  for (const dangerous of ["=cmd()", "+1+1", "-1", "@SUM(A1)"]) {
    const csv = toCsv(dataset([row({ name: dangerous })]));
    assert.match(
      csv,
      /"?\t/,
      `expected ${dangerous} to be prefixed with a tab`
    );
    assert.ok(csv.includes(dangerous), `expected ${dangerous} to survive intact`);
  }
});

test("CSV writes an empty cell for null, not the word null", () => {
  const csv = toCsv(dataset([row({ at: null })]));
  const line = csv.replace(/^﻿/, "").trim().split("\r\n")[1]!;
  assert.ok(line.endsWith(","), `expected a trailing empty cell, got: ${line}`);
  assert.doesNotMatch(csv, /null/);
});

test("CSV leads with a BOM so Excel reads it as UTF-8", () => {
  const csv = toCsv(dataset([row({ name: "Sphère / Personal Network" })]));
  assert.ok(csv.startsWith("﻿"));
  assert.match(csv, /Sphère/);
});

test("CSV booleans read as Yes/No rather than true/false", () => {
  assert.match(toCsv(dataset([row({ active: true })])), /,Yes,/);
  assert.match(toCsv(dataset([row({ active: false })])), /,No,/);
});

test("XLSX money becomes a formatted Number so Excel can sum it", () => {
  const rows = toXlsxRows(dataset([row({ amount: "354591.84" })]));
  const cell = rows[1]![1]!;
  assert.equal(cell.value, 354591.84);
  assert.equal(cell.type, Number);
  assert.equal(cell.format, "#,##0.00");
});

test("XLSX money conversion goes through decimal.js, correctly rounded", () => {
  // The one float this product creates, at the last step before serialisation.
  // The point is that it is the correctly-rounded double of the exact decimal.
  const rows = toXlsxRows(dataset([row({ amount: "7142857.14" })]));
  assert.equal(rows[1]![1]!.value, 7142857.14);
});

test("XLSX headers are bold", () => {
  const rows = toXlsxRows(dataset([row()]));
  assert.equal(rows[0]![0]!.fontWeight, "bold");
  assert.equal(rows[0]![0]!.value, "Name");
});

test("XLSX writes an empty cell for null — never a zero", () => {
  // A null archived_at means the row is active. A 0 there would render as a
  // date in 1900.
  const rows = toXlsxRows(dataset([row({ at: null })]));
  assert.deepEqual(rows[1]![4], {});
});

test("XLSX turns an unparseable money value into an empty cell, not NaN", () => {
  const rows = toXlsxRows(dataset([row({ amount: "not-a-number" })]));
  assert.deepEqual(rows[1]![1], {});
});

test("XLSX dates become real Date cells", () => {
  const rows = toXlsxRows(dataset([row({ at: "2026-07-17T10:30:00Z" })]));
  const cell = rows[1]![4]!;
  assert.equal(cell.type, Date);
  assert.ok(cell.value instanceof Date);
});

test("XLSX keeps an unparseable date as text rather than dropping it", () => {
  const rows = toXlsxRows(dataset([row({ at: "sometime last year" })]));
  assert.equal(rows[1]![4]!.type, String);
  assert.equal(rows[1]![4]!.value, "sometime last year");
});

test("XLSX column widths line up with the columns", () => {
  const data = dataset([row()]);
  assert.equal(xlsxColumnWidths(data).length, data.columns.length);
});

test("an empty dataset still exports its header", () => {
  // AC8 says the download matches the on-screen rows — and zero rows is a valid
  // answer that must still produce a readable file, not an empty one.
  const csv = toCsv(dataset([]));
  assert.match(csv, /Name,Amount/);
  assert.equal(toXlsxRows(dataset([])).length, 1);
});

test("filenames are dated so two exports never collide silently", () => {
  assert.equal(
    exportFilename("lead-sources", "csv", "2026-07-17"),
    "zeta-lead-sources-2026-07-17.csv"
  );
  assert.equal(
    exportFilename("developers", "xlsx", "2026-07-17"),
    "zeta-developers-2026-07-17.xlsx"
  );
});

test("only csv and xlsx are accepted formats", () => {
  assert.equal(isExportFormat("csv"), true);
  assert.equal(isExportFormat("xlsx"), true);
  assert.equal(isExportFormat("pdf"), false);
  assert.equal(isExportFormat("../../etc/passwd"), false);
});
