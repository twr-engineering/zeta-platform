import type { Worksheet } from "exceljs";

/**
 * M1.4 — cell readers over an ExcelJS worksheet. The workbook is a GSheets export
 * (verified against the real v30.20 file): strings are stored INLINE, dates as
 * Excel SERIALS, and some input cells hold a FORMULA with no cached result — the
 * rentals' Rate % is `=1/12` with an empty `<v>`, so a data-only read returns
 * nothing and we must fall back to the formula text. These helpers normalise all
 * of that, and — per Master PRD §4.3 — return money as EXACT decimal STRINGS, never
 * floats.
 */

type CellValue = ReturnType<Worksheet["getCell"]>["value"];

/** The raw JS value of a cell, unwrapping a formula cell to its cached result. */
function rawValue(ws: Worksheet, addr: string): CellValue {
  const cell = ws.getCell(addr);
  const v = cell.value;
  if (v !== null && typeof v === "object" && "formula" in v) {
    // A formula cell: prefer the cached result (may be undefined when the export
    // did not cache it — see the rate reader below).
    return (v as { result?: CellValue }).result ?? null;
  }
  return v;
}

/** A cell's plain display text, trimmed. Handles strings, numbers, dates, rich text. */
export function cellText(ws: Worksheet, addr: string): string {
  const v = rawValue(ws, addr);
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return dateToISO(v);
  // Rich text object → its concatenated runs.
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText
      .map((r) => r.text)
      .join("")
      .trim();
  }
  return String(v).trim();
}

/** Is a cell effectively blank? */
export function cellBlank(ws: Worksheet, addr: string): boolean {
  return cellText(ws, addr) === "";
}

/**
 * A numeric cell as an exact decimal string, or null when blank/non-numeric.
 * A number keeps its shortest round-trip form (`8000000`, `0.05`), which decimal.js
 * re-parses exactly; a string that is a plain number is passed through verbatim.
 */
export function cellNumberString(ws: Worksheet, addr: string): string | null {
  const v = rawValue(ws, addr);
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const cleaned = v.replace(/[₱,\s]/g, "").trim();
    return /^-?\d*\.?\d+$/.test(cleaned) ? cleaned : null;
  }
  return null;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // Excel/GSheets serial day 0
const MS_PER_DAY = 86_400_000;

function dateToISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Excel serial → ISO calendar date (UTC, so no timezone can shift the day). */
export function serialToISO(serial: number): string {
  return dateToISO(new Date(EXCEL_EPOCH_MS + Math.round(serial) * MS_PER_DAY));
}

/**
 * A date cell as ISO YYYY-MM-DD, or null when blank. GSheets stores dates as
 * serials; ExcelJS surfaces them either as a JS Date (date-formatted cell) or as
 * a raw number — both are handled, plus an already-ISO string.
 */
export function cellDateISO(ws: Worksheet, addr: string): string | null {
  const v = rawValue(ws, addr);
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return dateToISO(v);
  if (typeof v === "number") return serialToISO(v);
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const n = Number(v.trim());
    if (Number.isFinite(n)) return serialToISO(n);
  }
  return null;
}

/**
 * A rate cell as the engine's rate form: the exact fraction "a/b" when the cell
 * holds one (the rentals' `=1/12`, whose cached value the export dropped), else the
 * numeric decimal ("0.05"). Returns null when blank.
 */
export function cellRateString(ws: Worksheet, addr: string): string | null {
  const cell = ws.getCell(addr);
  const v = cell.value;
  if (v !== null && typeof v === "object" && "formula" in v) {
    const formula = String((v as { formula: string }).formula).replace(/^=/, "").trim();
    const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(formula);
    if (frac) return `${frac[1]}/${frac[2]}`;
    const result = (v as { result?: unknown }).result;
    if (typeof result === "number") return String(result);
  }
  return cellNumberString(ws, addr);
}
