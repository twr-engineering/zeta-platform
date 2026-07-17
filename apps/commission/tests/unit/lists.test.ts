import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  LEAD_SOURCE_SOFT_CAP,
  LIST_MONEY_RESTATING_FIELDS,
  deleteBlockedMessage,
  leadSourceCapWarning,
  listRequiresConfirmation,
  namesCollide,
  parseListName,
  referenceCountLabel,
} from "@/lib/settings/lists";
import {
  DEVELOPER_SEEDS,
  LEAD_SOURCE_SEEDS,
  PROPERTY_TYPE_SEEDS,
} from "@/lib/settings/seed-lists";

/**
 * M0 test plan #5 (uniqueness), #6 (archive) and the rule-3/8 gate
 * classification, pinned to the PRD's own words.
 *
 * These are the rules the SQL mirrors. A failure here means the two halves have
 * drifted, which is exactly the bug this file exists to catch early — the
 * database is the enforcement, but the UI must not offer a Save the server will
 * refuse, and the gate must not be decided differently in the two places.
 */

test("rule 7: uniqueness is case-insensitive and trimmed", () => {
  // The PRD's own example, verbatim (§4 rule 7).
  assert.equal(namesCollide("megaworld geri ", "Megaworld GERI"), true);
  assert.equal(namesCollide("Condo", "condo"), true);
  assert.equal(namesCollide("  Condo  ", "Condo"), true);
  assert.equal(namesCollide("Condo", "Condotel"), false);
  assert.equal(namesCollide("House & Lot", "House and Lot"), false);
});

test("names are trimmed before they are stored", () => {
  const parsed = parseListName("developer", "  Abrown Inc.  ");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value, "Abrown Inc.");
});

test("a blank or whitespace-only name is refused", () => {
  for (const raw of ["", "   ", "\t", "\n"]) {
    const parsed = parseListName("lead_source", raw);
    assert.equal(parsed.ok, false, `expected ${JSON.stringify(raw)} to be refused`);
  }
});

test("name length limits mirror the PRD's declared types", () => {
  // §3.4 string(80), §3.5 string(120), §3.6 string(80) — and the CHECK
  // constraints in SQL carry the same numbers.
  assert.equal(parseListName("property_type", "x".repeat(80)).ok, true);
  assert.equal(parseListName("property_type", "x".repeat(81)).ok, false);
  assert.equal(parseListName("developer", "x".repeat(120)).ok, true);
  assert.equal(parseListName("developer", "x".repeat(121)).ok, false);
  assert.equal(parseListName("lead_source", "x".repeat(80)).ok, true);
  assert.equal(parseListName("lead_source", "x".repeat(81)).ok, false);
});

test("length is measured after trimming, not before", () => {
  // Otherwise a name that fits would be refused for spaces that never reach the
  // database — the CHECK constraint forbids storing them at all.
  assert.equal(parseListName("property_type", `  ${"x".repeat(80)}  `).ok, true);
});

test("rule 8: comm_base restates money and requires a confirmation", () => {
  assert.equal(listRequiresConfirmation("developer", ["comm_base"]), true);
  assert.equal(listRequiresConfirmation("developer", ["name", "comm_base"]), true);
});

test("vat_rule restates money — the deliberate extension of rule 8", () => {
  // Not named by any rule, but it decides whether a list price is VAT-able,
  // which moves Net List Price and therefore GCI. Asserted on purpose so that
  // flipping this decision is a visible change, not a silent one.
  assert.equal(listRequiresConfirmation("property_type", ["vat_rule"]), true);
  assert.deepEqual(LIST_MONEY_RESTATING_FIELDS.property_type, ["vat_rule"]);
});

test("rule 6: a rename never requires a confirmation", () => {
  // Deals store FK ids, so a rename moves no number — it propagates to every
  // display and M7 aggregates under one row (AC6). Gating it would train the
  // agent to click through the gates that matter.
  assert.equal(listRequiresConfirmation("property_type", ["name"]), false);
  assert.equal(listRequiresConfirmation("developer", ["name"]), false);
  assert.equal(listRequiresConfirmation("lead_source", ["name"]), false);
});

test("a lead source has nothing that restates money", () => {
  assert.deepEqual(LIST_MONEY_RESTATING_FIELDS.lead_source, []);
  assert.equal(listRequiresConfirmation("lead_source", ["name", "sort_order"]), false);
});

test("the 50-source cap warns and never blocks (open question 4)", () => {
  assert.equal(leadSourceCapWarning(0), null);
  assert.equal(leadSourceCapWarning(LEAD_SOURCE_SOFT_CAP), null);
  const warning = leadSourceCapWarning(LEAD_SOURCE_SOFT_CAP + 1);
  assert.ok(warning, "expected a warning past the cap");
  assert.match(warning, /51/);
  // The sheet's hard limit becomes advice: "nothing is blocked".
  assert.match(warning, /nothing is blocked/i);
});

test("reference counts read as English, singular and plural", () => {
  assert.equal(referenceCountLabel(0), "Not used yet");
  assert.equal(referenceCountLabel(1), "Used by 1 deal");
  assert.equal(referenceCountLabel(12), "Used by 12 deals");
});

test("AC4: a blocked delete explains itself and offers Archive", () => {
  const message = deleteBlockedMessage("property_type", "Condo", 12);
  assert.match(message, /12 deals/);
  assert.match(message, /Archive/i);
  // The sheet's silent fallback is what rule 5 replaces — the message has to
  // say what would break, not merely refuse.
  assert.match(message, /computed with/);
});

test("the workbook's seed lists match WORKBOOK_REFERENCE §2 exactly", () => {
  // These are an OFFER, not a default (rule 11) — but an offer that quietly
  // drifts from the workbook is a different offer than the UI claims to make.
  assert.equal(PROPERTY_TYPE_SEEDS.length, 7);
  assert.deepEqual(
    PROPERTY_TYPE_SEEDS.map((s) => [s.name, s.vat_rule]),
    [
      ["House & Lot", "threshold"],
      ["Condo", "threshold"],
      ["Townhouse", "threshold"],
      ["Lot", "always_vat"],
      ["Commercial", "always_vat"],
      // "parking is treated as commercial" (§3.4) — not a typo.
      ["Parking", "always_vat"],
      ["Condotel", "threshold"],
    ]
  );

  assert.equal(DEVELOPER_SEEDS.length, 5);
  assert.deepEqual(
    DEVELOPER_SEEDS.map((s) => [s.name, s.comm_base]),
    [
      ["Megaworld GERI", "gross"],
      ["CLI", "net"],
      ["Abrown Inc.", "net"],
      ["Pueblo de Oro", "net"],
      ["Weecomm", "net"],
    ]
  );

  // The sheet lists 13 sources; their order becomes sort_order 1..13.
  assert.equal(LEAD_SOURCE_SEEDS.length, 13);
  assert.deepEqual(LEAD_SOURCE_SEEDS.map((s) => s.name), [
    "Referral",
    "Repeat Client",
    "Sphere / Personal Network",
    "Open House",
    "Sign Call / Walk-in",
    "Facebook Organic",
    "Facebook Ads",
    "TikTok",
    "YouTube",
    "Instagram",
    "LinkedIn",
    "Website",
    "Lamudi",
  ]);
});

test("every seed name survives its own validation rules", () => {
  // "Sphere / Personal Network" and "Abrown Inc." carry punctuation; an offer
  // the product would refuse to accept is not an offer.
  for (const seed of PROPERTY_TYPE_SEEDS) {
    assert.equal(parseListName("property_type", seed.name).ok, true, seed.name);
  }
  for (const seed of DEVELOPER_SEEDS) {
    assert.equal(parseListName("developer", seed.name).ok, true, seed.name);
  }
  for (const seed of LEAD_SOURCE_SEEDS) {
    assert.equal(parseListName("lead_source", seed.name).ok, true, seed.name);
  }
});

test("the seed lists contain no duplicates under rule 7's own comparison", () => {
  const check = (names: readonly string[]) => {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        assert.equal(
          namesCollide(names[i]!, names[j]!),
          false,
          `${names[i]} collides with ${names[j]}`
        );
      }
    }
  };
  check(PROPERTY_TYPE_SEEDS.map((s) => s.name));
  check(DEVELOPER_SEEDS.map((s) => s.name));
  check(LEAD_SOURCE_SEEDS.map((s) => s.name));
});

test("the lead-source seed list sits under the soft cap", () => {
  assert.equal(leadSourceCapWarning(LEAD_SOURCE_SEEDS.length), null);
});
