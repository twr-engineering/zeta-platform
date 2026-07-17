/**
 * Column selects for tables holding money or rates.
 *
 * WHY THIS FILE EXISTS — read before writing any query that touches `numeric`:
 *
 * PostgREST serializes a Postgres `numeric` as a JSON *number*. `JSON.parse`
 * turns that into an IEEE-754 double, so `select("*")` on tax_settings yields
 * `ewt_rate: 0.1` — a binary float in a money path, which Master PRD §4.3
 * forbids outright. Verified against the live project, 2026-07-17:
 *
 *   select=ewt_rate         ->  {"ewt_rate": 0.1000}    // JSON number -> 0.1
 *   select=ewt_rate::text   ->  {"ewt_rate": "0.1000"}  // string, scale intact
 *
 * The `::text` cast is what makes the "exact decimal end to end" guarantee real
 * rather than aspirational: the value stays a string from Postgres all the way
 * into `toMoney()`, and never touches a float.
 *
 * RULE: every `numeric` column is selected `::text`. Never `select("*")` on a
 * table with money or rates. M1's deals, M4's receivables and M5's payments must
 * each add their own select here.
 */

/** tax_settings — vat_rate, ewt_rate, property_vat_threshold are numeric. */
export const TAX_SETTINGS_SELECT = [
  "id",
  "workspace_id",
  "vat_rate::text",
  "vat_registered",
  "vat_registered_confirmed_at",
  "ewt_rate::text",
  "property_vat_threshold::text",
  "chase_idle_months",
  "created_at",
  "updated_at",
].join(",");

/** workspace holds no money; deal_id_sequence is an integer, which is exact. */
export const WORKSPACE_SELECT = "*";

/** profiles holds no money. */
export const PROFILES_SELECT = "*";
