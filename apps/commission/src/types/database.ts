/**
 * The money-safe view of the generated schema types. Import from here, never
 * from `./database.generated`.
 *
 * WHY THIS LAYER EXISTS
 *
 * `supabase gen types` types every Postgres `numeric` as `number`, because that
 * is what PostgREST returns by default — a JSON number, which `JSON.parse`
 * makes an IEEE-754 float. Master PRD §4.3 forbids binary floats in money
 * paths, so the generator's output is *wrong for this product*. Verified live
 * against the project on 2026-07-17:
 *
 *   select("*")               -> ewt_rate: 0.1,      threshold: 3600000
 *                                (float, and the 4dp/2dp scale is gone)
 *   select("ewt_rate::text")  -> ewt_rate: "0.1000", threshold: "3600000.00"
 *
 * Queries therefore cast money columns with `::text` (see
 * `@/lib/supabase/selects`), and this module re-types those columns as `string`
 * to match what actually arrives. Hand-editing the generated file instead would
 * work exactly until the next `gen types`, which would silently reintroduce the
 * float — the failure mode being a product that quietly stops tying to the
 * centavo. Keeping the override here means regeneration is safe.
 *
 * Adding a table with money columns (M1 deals, M4 receivables, M5 payments)?
 * Add its `::text` select to `@/lib/supabase/selects` AND its override below.
 */

import type { Database as Generated, Json } from "./database.generated";

export type { Json };

type PublicSchema = Generated["public"];
type GeneratedTables = PublicSchema["Tables"];

/** Re-type `K` as the exact-decimal string it is fetched as. */
type WithMoneyStrings<Row, K extends keyof Row> = Omit<Row, K> &
  Record<K, string>;

/** Same, for Insert/Update shapes where the columns are optional. */
type WithOptionalMoneyStrings<Row, K extends keyof Row> = Omit<Row, K> &
  Partial<Record<K, string>>;

// --- tax_settings (M0 §3.3) -------------------------------------------------

type TaxSettingsTable = GeneratedTables["tax_settings"];

/** numeric(6,4), numeric(6,4), numeric(14,2) */
type TaxSettingsMoneyColumns =
  | "vat_rate"
  | "ewt_rate"
  | "property_vat_threshold";

type TaxSettingsOverride = Omit<TaxSettingsTable, "Row" | "Insert" | "Update"> & {
  Row: WithMoneyStrings<TaxSettingsTable["Row"], TaxSettingsMoneyColumns>;
  Insert: WithOptionalMoneyStrings<
    TaxSettingsTable["Insert"],
    TaxSettingsMoneyColumns
  >;
  Update: WithOptionalMoneyStrings<
    TaxSettingsTable["Update"],
    TaxSettingsMoneyColumns
  >;
};

// --- audit_log_entry (M0 §3.7) ----------------------------------------------

type AuditTable = GeneratedTables["audit_log_entry"];

type AuditOverride = Omit<AuditTable, "Update" | "Row"> & {
  Row: Omit<AuditTable["Row"], "field_changes"> & {
    field_changes: FieldChanges;
  };
  /**
   * Append-only: a database trigger rejects every UPDATE (M0 §8). The generator
   * cannot know that, so the type says it here — a compile error is a kinder
   * teacher than a runtime `restrict_violation`.
   */
  Update: never;
};

// --- settings_change_event (M0 rule 3; M0.2's recompute contract) ------------

type SettingsEventTable = GeneratedTables["settings_change_event"];

type SettingsEventOverride = Omit<SettingsEventTable, "Row" | "Update"> & {
  Row: Omit<SettingsEventTable["Row"], "field_changes"> & {
    field_changes: FieldChanges;
  };
  /**
   * Consumption is the only permitted update (a trigger rejects the rest), so
   * the type offers only the consumption stamp. M1 marks an event done; nothing
   * edits what the event says happened.
   */
  Update: { consumed_at: string; consumed_by: string };
};

// --- Functions --------------------------------------------------------------

type GeneratedFunctions = PublicSchema["Functions"];

type UpdateTaxSettingsFn = GeneratedFunctions["update_tax_settings"];

/**
 * The generator types the rate arguments `number`, which is the float bug from
 * the other direction: `rpc("update_tax_settings", { p_ewt_rate: 0.05 })` would
 * serialize a double into a money column. PostgREST casts a JSON *string*
 * straight to `numeric`, so these are strings — "0.0500", not 0.05.
 *
 * Counts stay `number`: an integer round-trips through JSON exactly.
 */
type UpdateTaxSettingsMoneyArgs =
  | "p_vat_rate"
  | "p_ewt_rate"
  | "p_property_vat_threshold";

type UpdateTaxSettingsOverride = Omit<UpdateTaxSettingsFn, "Args"> & {
  Args: Omit<UpdateTaxSettingsFn["Args"], UpdateTaxSettingsMoneyArgs> &
    Partial<Record<UpdateTaxSettingsMoneyArgs, string>>;
};

// --- the money-safe Database ------------------------------------------------

export type Database = Omit<Generated, "public"> & {
  public: Omit<PublicSchema, "Tables" | "Functions"> & {
    Tables: Omit<
      GeneratedTables,
      "tax_settings" | "audit_log_entry" | "settings_change_event"
    > & {
      tax_settings: TaxSettingsOverride;
      audit_log_entry: AuditOverride;
      settings_change_event: SettingsEventOverride;
    };
    Functions: Omit<GeneratedFunctions, "update_tax_settings"> & {
      update_tax_settings: UpdateTaxSettingsOverride;
    };
  };
};

// --- helpers, bound to the overridden Database ------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

/** A single field's old→new pair. Decimals are strings, to stay exact. */
export type FieldChange = {
  old: Json;
  new: Json;
};

export type FieldChanges = Record<string, FieldChange>;
