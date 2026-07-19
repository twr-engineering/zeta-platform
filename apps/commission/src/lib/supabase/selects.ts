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

/**
 * audit_log_entry has no `numeric` column — the money it records lives inside
 * `field_changes`, a jsonb the write path already fills with strings. So `*` is
 * safe here, and safe for the same reason the rest of this file exists: the
 * exact decimal never becomes a JSON number.
 */
export const AUDIT_LOG_SELECT = "*";

/** settings_change_event: same shape, same reasoning. affected_deal_count is an integer. */
export const SETTINGS_CHANGE_EVENT_SELECT = "*";

/**
 * The three configuration lists (M0 §3.4–3.6) carry NO `numeric` column — names
 * are text, vat_rule/comm_base are enums, sort_order is an integer. So `*` is
 * safe, and stated here rather than left as an absence: the next reader should
 * be able to tell "there is no money in this table" from "someone forgot the
 * ::text cast".
 *
 * The money these lists *govern* is real (vat_rule decides whether a list price
 * is VAT-able; comm_base decides which price the rate applies to) — but it is
 * computed in M1 from tax_settings' rates, which do carry the cast above.
 */
export const PROPERTY_TYPE_SELECT = "*";
export const DEVELOPER_SELECT = "*";
export const LEAD_SOURCE_SELECT = "*";

/**
 * deal (M1 §3.1) — the money-dense table. Every peso figure and rate is
 * `numeric`, so every one is selected `::text` (the override in
 * @/types/database types them `string`). NEVER `select("*")` here: it would hand
 * back `net_gci: 354591.84` as a float and quietly break the ₱-to-the-centavo
 * guarantee the whole engine exists to keep. `rate_pct` is already `text` (it
 * carries the exact fraction "1/12"), so it is listed without a cast.
 */
export const DEAL_SELECT = [
  "id",
  "workspace_id",
  "deal_code",
  "booked_date",
  "transaction_type",
  "deal_type",
  "developer_id",
  "client_name",
  "representation",
  "property_type_id",
  "lead_source_id",
  "property_details",
  "mode_of_payment",
  "list_price::text",
  "force_vat",
  "commission_basis",
  "rate_pct",
  "fixed_amount::text",
  "receipt_issued",
  "incentive_billed::text",
  "incentive_taxable",
  "referral_out_pct::text",
  "referral_out_fixed::text",
  "referral_paid",
  "property_vat",
  "net_list_price::text",
  "comm_base",
  "vat_basis",
  "billed_commission::text",
  "gci_net_of_vat::text",
  "incentive_net::text",
  "referral_out::text",
  "net_gci::text",
  "default_total_collectible::text",
  "vat_memo::text",
  "ewt_memo::text",
  "yield_on_list::text",
  "taxable",
  "booked_year",
  "display_label",
  "is_sample",
  "archived_at",
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

/**
 * payment (M5 §3.1) — money-dense, so every peso figure and rate is selected
 * `::text` (the override in @/types/database types them `string`). The five split
 * ₱ fields (net_of_vat/vat/ewt/net_cash/retained), the gross, and the two `*_used`
 * rate anchors all cast. NEVER `select("*")` here. Integers (year_paid, month_paid,
 * version), dates and the two enums (payment_type, vat_basis_used) round-trip
 * exactly, so they need no cast.
 */
export const PAYMENT_SELECT = [
  "id",
  "workspace_id",
  "deal_id",
  "payment_date",
  "gross_amount::text",
  "payment_type",
  "reference_note",
  "net_of_vat::text",
  "vat_amount::text",
  "ewt_amount::text",
  "net_cash::text",
  "retained_cash::text",
  "vat_basis_used",
  "ewt_rate_used::text",
  "vat_rate_used::text",
  "year_paid",
  "month_paid",
  "is_sample",
  "archived_at",
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

/**
 * annual_target_override (M6 §3.1) — `amount` is numeric(14,2), so it is selected
 * `::text` (the override in @/types/database types it `string`). The rest (year,
 * note, audit fields) round-trip exactly. NEVER `select("*")` here.
 */
export const ANNUAL_TARGET_OVERRIDE_SELECT = [
  "id",
  "workspace_id",
  "year",
  "amount::text",
  "note",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
].join(",");

/**
 * yield_aggregate (M2 §3.5) — the materialized yield read model. The four sum
 * columns are numeric(14,2), so each is selected `::text` (the override in
 * @/types/database types them `string`). NEVER `select("*")` here — it would hand
 * back volume_sum/gci_sum as floats and break the ₱-to-the-centavo tie the
 * reconciliation asserts. `deal_count` is a true integer and `booked_year`/segment
 * round-trip exactly, so they need no cast.
 */
export const YIELD_AGGREGATE_SELECT = [
  "workspace_id",
  "segment",
  "booked_year",
  "deal_count",
  "volume_sum::text",
  "gci_sum::text",
  "incentive_net_sum::text",
  "referral_out_sum::text",
  "updated_at",
].join(",");

/**
 * payment_event (§3.4) — the append-only event log. No `numeric` column: the money
 * lives inside old_values/new_values (jsonb the write path filled with ::text
 * strings via app.payment_snapshot), so `*` is safe — the exact decimal never
 * becomes a JSON number.
 */
export const PAYMENT_EVENT_SELECT = "*";

/**
 * plan_year_target (M3 §3.1) — the per-year planning inputs. The Net Income Target,
 * two cost fractions, and two optional overrides are numeric, so each is selected
 * `::text` (the override in @/types/database types them `string | null`; NULL is a
 * real "use default / all-time / not-plannable" state, preserved by the cast). NEVER
 * `select("*")` here — it would return the rates as floats and break the ₱-exact
 * derivation the engine feeds M6 (16,920,000 to the centavo).
 */
export const PLAN_YEAR_TARGET_SELECT = [
  "id",
  "workspace_id",
  "year",
  "net_income_target::text",
  "opex_pct::text",
  "cos_pct::text",
  "yield_override::text",
  "avg_price_override::text",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
].join(",");

/**
 * funnel_rates (M3 §3.2) — the seven global conversion rates. Each is numeric(6,4),
 * so selected `::text` (the override types them `string`). The engine divides upward
 * by these as exact decimals, so a float from `select("*")` would drift the funnel
 * counts. `year` (NULL = global) round-trips exactly.
 */
export const FUNNEL_RATES_SELECT = [
  "id",
  "workspace_id",
  "year",
  "listing_to_sold::text",
  "listing_appointment_rate::text",
  "seller_contact_to_appt::text",
  "seller_lead_to_contact::text",
  "buyer_viewing_to_atp::text",
  "buyer_contact_to_viewing::text",
  "buyer_lead_to_contact::text",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
].join(",");

/**
 * deal_event (FR-M1-08) — the append-only event log. No `numeric` column: the
 * money lives inside old_values/new_values (jsonb the write path filled with
 * ::text strings via app.deal_snapshot), so `*` is safe for the same reason it
 * is on audit_log_entry — the exact decimal never becomes a JSON number.
 */
export const DEAL_EVENT_SELECT = "*";

/**
 * receivable (M4 §3.1) — money-dense, so every peso figure is selected `::text`
 * (the override in @/types/database types them `string`). Mirrors and Rule K
 * anchors (booked_net_gci, default/total collectible, confirmed) plus the reserved
 * payment-derived columns M4.2/M4.3 fill in. NEVER `select("*")` here. Integers
 * (booked_year, months_idle, age_months, days_to_first_release, version) and dates
 * round-trip exactly, so they need no cast; total_collectible is a generated
 * numeric and casts the same as any money column.
 */
export const RECEIVABLE_SELECT = [
  "id",
  "workspace_id",
  "deal_id",
  "deal_code",
  "booked_year",
  "developer_id",
  "client_name",
  "property_details",
  "deal_type",
  "lead_source_id",
  "booking_date",
  "booked_net_gci::text",
  "default_total_collectible::text",
  "confirmed_collectible::text",
  "total_collectible::text",
  "status",
  "next_action_note",
  "collected_net::text",
  "balance::text",
  "pct_collected::text",
  "variance::text",
  "written_off::text",
  "last_payment_date",
  "first_payment_date",
  "months_idle",
  "age_months",
  "days_to_first_release",
  "chase_priority::text",
  "override_review_flagged_at",
  "is_sample",
  "archived_at",
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");
