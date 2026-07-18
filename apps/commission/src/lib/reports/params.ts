import { manilaYear } from "@/lib/date/manila";

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
