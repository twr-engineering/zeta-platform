/**
 * M9 — client/JS mirror of the SQL `zeta_search_normalize` + `zeta_search_needle`
 * (see migration 20260719210000_m91_search_read_layer).
 *
 * The actual DB match runs entirely in SQL — the raw text is passed to the RPC and
 * normalized there, so the needle and the indexed `search_blob` always pass through
 * the identical transform (no drift). These helpers exist for (a) the type-ahead /
 * preview UI in M9.2 and (b) unit tests that pin the normalization contract (PRD
 * §3.3, Rule 4): trim, collapse internal whitespace, strip diacritics, lowercase.
 *
 * JS strips diacritics via Unicode NFD decomposition; SQL uses the `unaccent`
 * dictionary. The two agree on Latin diacritics (the only kind in real-estate
 * client/property text) — "Peñafrancia" ↔ "penafrancia" — which is all Rule 4 asks.
 */

const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

/** trim → collapse whitespace → strip diacritics → lowercase (PRD §3.3). */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Normalize, then escape the SQL LIKE metacharacters (\, %, _) so a user typing
 * "100%" or "unit_2" matches those literals, not wildcards (Rule 12). Postgres
 * LIKE uses backslash as its default escape character.
 */
export function escapeLikePattern(input: string): string {
  return normalizeSearchText(input).replace(/([\\%_])/g, "\\$1");
}
