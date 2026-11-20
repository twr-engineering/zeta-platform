import { manilaYear } from "@/lib/date/manila";
import type { MatrixValue } from "./build";

/**
 * Parse the `?year=` query param shared by reports 3 & 4 (rule 3). Missing → the
 * current Manila year (the default selection). Present-but-not-a-plausible-calendar-
 * year → an error the route turns into a 400 (a forged `?year=abc` gets a clear
 * answer, not a silent default or a NaN filter). Pure; no server-only dependency.
 */
export type YearParamResult =
  | { ok: true; year: number }
  | { ok: false; error: string };

export function parseYearParam(raw: string | null): YearParamResult {
  if (raw === null || raw.trim() === "") return { ok: true, year: manilaYear() };

  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return { ok: false, error: "The year must be a four-digit calendar year." };
  }
  return { ok: true, year };
}

/**
 * Parse the vintage matrix `?value=` toggle (§3.3 / FR-M8-04). Missing → the default
 * `net_of_vat` (FR-M8-04: Net of VAT is the default view). Present-but-unknown → an
 * error the route turns into a 400, so a forged `?value=foo` gets a clear answer
 * rather than silently defaulting. Pure; no server-only dependency.
 */
export type MatrixValueParamResult =
  | { ok: true; value: MatrixValue }
  | { ok: false; error: string };

export function parseMatrixValueParam(raw: string | null): MatrixValueParamResult {
  if (raw === null || raw.trim() === "") return { ok: true, value: "net_of_vat" };
  if (raw === "net_of_vat" || raw === "net_cash") return { ok: true, value: raw };
  return {
    ok: false,
    error: 'The value toggle must be "net_of_vat" or "net_cash".',
  };
}
