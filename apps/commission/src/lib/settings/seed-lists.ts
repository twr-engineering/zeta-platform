import type { DeveloperCommBase, PropertyVatRule } from "@/types/entities";

/**
 * The workbook's example lists — AN OFFER, NOT A DEFAULT (M0 rule 11).
 *
 * READ THIS BEFORE USING ANYTHING BELOW.
 *
 * Rule 11: "Workspace creation seeds nothing silently. The first-run wizard
 * (M10) *offers* the seed lists; the agent can accept, edit, or skip." §3.4 and
 * §3.5 say it twice more — "user-editable, NOT hard-coded", "importer/demo data
 * only — never product defaults".
 *
 * So these are not the product's property types. They are one particular agent's
 * property types, extracted from v30.20's Settings tab
 * (WORKBOOK_REFERENCE §2), shown to a new agent as a starting point they can
 * take, trim, or ignore entirely. Every one of them is editable, renameable,
 * archivable and deletable the moment it exists.
 *
 * Concretely, that means:
 *   - nothing here is inserted by the signup bootstrap or by any migration;
 *   - the seed_* database functions take whatever the agent accepted as a
 *     parameter and refuse a non-empty list, so accepting is idempotent;
 *   - the UI lets rows be deselected before accepting — that is the "edit" in
 *     "accept, edit, or skip".
 *
 * If a later module ever needs to *assume* one of these exists, that is a bug in
 * the later module: the agent may have skipped the offer, and a workspace whose
 * lists are empty is a valid workspace.
 */

export type PropertyTypeSeed = { name: string; vat_rule: PropertyVatRule };
export type DeveloperSeed = { name: string; comm_base: DeveloperCommBase };
export type LeadSourceSeed = { name: string };

/**
 * WORKBOOK_REFERENCE §2, in the sheet's own order.
 *
 * "Parking = Always VAT" is not a typo — the workbook's note says parking is
 * treated as commercial (§3.4).
 */
export const PROPERTY_TYPE_SEEDS: readonly PropertyTypeSeed[] = [
  { name: "House & Lot", vat_rule: "threshold" },
  { name: "Condo", vat_rule: "threshold" },
  { name: "Townhouse", vat_rule: "threshold" },
  { name: "Lot", vat_rule: "always_vat" },
  { name: "Commercial", vat_rule: "always_vat" },
  { name: "Parking", vat_rule: "always_vat" },
  { name: "Condotel", vat_rule: "threshold" },
];

/** WORKBOOK_REFERENCE §2. Megaworld GERI is the sheet's own example of a Gross base. */
export const DEVELOPER_SEEDS: readonly DeveloperSeed[] = [
  { name: "Megaworld GERI", comm_base: "gross" },
  { name: "CLI", comm_base: "net" },
  { name: "Abrown Inc.", comm_base: "net" },
  { name: "Pueblo de Oro", comm_base: "net" },
  { name: "Weecomm", comm_base: "net" },
];

/** WORKBOOK_REFERENCE §2 — 13 sources, in sheet order (that order becomes sort_order 1..13). */
export const LEAD_SOURCE_SEEDS: readonly LeadSourceSeed[] = [
  { name: "Referral" },
  { name: "Repeat Client" },
  { name: "Sphere / Personal Network" },
  { name: "Open House" },
  { name: "Sign Call / Walk-in" },
  { name: "Facebook Organic" },
  { name: "Facebook Ads" },
  { name: "TikTok" },
  { name: "YouTube" },
  { name: "Instagram" },
  { name: "LinkedIn" },
  { name: "Website" },
  { name: "Lamudi" },
];

/**
 * Where the offer comes from, said out loud in the UI. An agent accepting a list
 * of developers they have never sold for deserves to know it came from the
 * workbook's example file and not from us guessing about their business.
 */
export const SEED_PROVENANCE =
  "These come from the v30.20 workbook's own Settings tab — one agent's list, offered as a starting point. Take what fits, drop what doesn't; you can rename, archive or delete any of them later.";
