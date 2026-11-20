import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  D021_COACH_MARKS,
  D021_FIGURES,
  D021_FIXTURE,
  D021_SAMPLE_PAYMENT,
} from "@/lib/onboarding/sample-fixture";
import {
  checklistItems,
  isChecklistVisible,
  type ChecklistState,
} from "@/lib/onboarding/checklist-derive";

/**
 * M10.3 — the sample fixture + coach-mark script + checklist derivation. M10 owns
 * no money, so these guard the ORCHESTRATION contract: the coach-marks quote the
 * exact D021 figures M1's engine produces (rendered, not computed), and the
 * checklist derivation obeys the rule-9/10 invariants.
 */

test("D021 fixture ties to the workbook's known inputs", () => {
  assert.equal(D021_FIXTURE.listPrice, "8000000");
  assert.equal(D021_FIXTURE.rate, "5");
  assert.equal(D021_FIXTURE.developerName, "Abrown Inc.");
  assert.equal(D021_FIXTURE.developerCommBase, "net");
  assert.equal(D021_FIXTURE.propertyTypeName, "House & Lot");
  assert.equal(D021_FIXTURE.incentiveBilled, "40000");
  assert.equal(D021_FIXTURE.incentiveTaxable, "yes");
});

test("the NET GCI figure is D021's ₱354,591.84 (AC2)", () => {
  assert.equal(D021_FIGURES.netGci, "354,591.84");
  assert.equal(D021_FIGURES.gci, "318,877.55");
  assert.equal(D021_FIGURES.incentiveNet, "35,714.29");
  // NET GCI = GCI + incentive net (Rule H, referral out 0).
  assert.equal(D021_FIGURES.vatMemo, "42,551.02");
  assert.equal(D021_FIGURES.ewtMemo, "35,459.18");
});

test("the sample payment split + balance are D021's (AC2)", () => {
  assert.equal(D021_SAMPLE_PAYMENT.gross, "50000");
  assert.equal(D021_SAMPLE_PAYMENT.paymentType, "incentive");
  assert.equal(D021_SAMPLE_PAYMENT.split.netOfVat, "44,642.86");
  assert.equal(D021_SAMPLE_PAYMENT.split.vat, "5,357.14");
  assert.equal(D021_SAMPLE_PAYMENT.split.ewt, "4,464.29");
  assert.equal(D021_SAMPLE_PAYMENT.split.netCash, "45,535.71");
  assert.equal(D021_SAMPLE_PAYMENT.balanceAfter, "309,948.98");
});

test("every coach-mark points at a real form/panel anchor, in a sensible order", () => {
  // Anchors the deal form + computed panel actually expose (data-testid values).
  const KNOWN_ANCHORS = new Set([
    "field-listPrice",
    "field-developerId",
    "field-rate",
    "field-incentiveBilled",
    "computed-gci",
    "computed-net-gci",
    "computed-vat-memo",
    "computed-ewt-memo",
    "computed-yield",
    "deal-submit",
  ]);
  assert.ok(D021_COACH_MARKS.length >= 8, "at least the eight teaching moments");
  for (const mark of D021_COACH_MARKS) {
    assert.ok(KNOWN_ANCHORS.has(mark.anchor), `unknown anchor: ${mark.anchor}`);
    assert.ok(mark.title.length > 0 && mark.body.length > 0);
  }
  // The last mark drives the save.
  assert.equal(D021_COACH_MARKS[D021_COACH_MARKS.length - 1].anchor, "deal-submit");
});

test("the coach-marks quote the exact engine figures they explain", () => {
  const byId = Object.fromEntries(D021_COACH_MARKS.map((m) => [m.id, m]));
  assert.ok(byId["gci"].body.includes(D021_FIGURES.gci));
  assert.ok(byId["net-gci"].body.includes(D021_FIGURES.netGci));
  assert.ok(byId["memos"].body.includes(D021_FIGURES.vatMemo));
  assert.ok(byId["memos"].body.includes(D021_FIGURES.ewtMemo));
});

// --- checklist derivation ---------------------------------------------------

const NOW = "2026-07-19T00:00:00Z";

function state(overrides: Partial<ChecklistState> = {}): ChecklistState {
  return {
    settingsReviewedAt: null,
    firstDealAt: null,
    firstPaymentAt: null,
    importerRunAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

test("checklist items are the four §3.2 items, undone by default", () => {
  const items = checklistItems(state());
  assert.deepEqual(
    items.map((i) => i.key),
    ["settings_reviewed", "first_deal", "first_payment", "importer_run"],
  );
  assert.ok(items.every((i) => i.done === false));
});

test("each item ticks only when its timestamp is present", () => {
  const items = checklistItems(
    state({ settingsReviewedAt: NOW, firstDealAt: NOW }),
  );
  const done = Object.fromEntries(items.map((i) => [i.key, i.done]));
  assert.equal(done.settings_reviewed, true);
  assert.equal(done.first_deal, true);
  assert.equal(done.first_payment, false);
  assert.equal(done.importer_run, false);
});

test("dismissal hides the card; it is reversible (rule 9 — display only)", () => {
  assert.equal(isChecklistVisible(state()), true);
  assert.equal(isChecklistVisible(state({ dismissedAt: NOW })), false);
  // Restoring clears dismissed_at → visible again.
  assert.equal(isChecklistVisible(state({ dismissedAt: null })), true);
});
