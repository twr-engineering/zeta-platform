import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  isStaleBasis,
  staleBasisReasons,
  staleBasisExplanation,
  type CurrentBasis,
  type StaleBasisAnchors,
} from "@/lib/payments/stale";

/**
 * M5.3 — stale-basis detection (FR-M5-12, §3.3 / §6.4). A payment's split is a
 * save-time snapshot; a deal correction or a settings change never rewrites it
 * (§3.3.3–4). A row is "stale-basis" when its stored `*_used` anchors no longer
 * match what the deal + settings would produce today — an informational signal
 * that drives the OPT-IN, per-payment recompute. Being a pure predicate over the
 * three anchors the engine keys off (vat_basis, ewt_rate, vat_rate), it is
 * testable to the exact rows the ⚠ marks.
 *
 * The D021 fixture is the anchor: Inclusive basis, EWT 10%, VAT 12%.
 */

function anchors(over: Partial<StaleBasisAnchors> = {}): StaleBasisAnchors {
  return {
    vat_basis_used: "inclusive",
    ewt_rate_used: "0.1000",
    vat_rate_used: "0.1200",
    ...over,
  };
}

function current(over: Partial<CurrentBasis> = {}): CurrentBasis {
  return {
    vat_basis: "inclusive",
    ewt_rate: "0.1000",
    vat_rate: "0.1200",
    ...over,
  };
}

test("not stale when the snapshot matches the deal + settings today", () => {
  assert.equal(isStaleBasis(anchors(), current()), false);
  assert.deepEqual(staleBasisReasons(anchors(), current()), []);
  assert.equal(staleBasisExplanation(anchors(), current()), null);
});

test("rate strings compare as decimals, not by textual form (0.1 == 0.1000)", () => {
  assert.equal(
    isStaleBasis(anchors({ ewt_rate_used: "0.1000" }), current({ ewt_rate: "0.10" })),
    false
  );
  assert.equal(
    isStaleBasis(anchors({ vat_rate_used: "0.1200" }), current({ vat_rate: "0.12" })),
    false
  );
});

test("a VAT-basis correction (inclusive → n/a) is stale", () => {
  const a = anchors({ vat_basis_used: "inclusive" });
  const c = current({ vat_basis: "n_a" });
  assert.equal(isStaleBasis(a, c), true);
  assert.deepEqual(staleBasisReasons(a, c), ["vat_basis"]);
  assert.match(staleBasisExplanation(a, c) ?? "", /VAT basis 'inclusive' → now 'n\/a'/);
});

test("an EWT rate change (10% → 5%) flags the old row (§3.3.4)", () => {
  // The stored split is correct history (§3.3.4), but the row is still surfaced so
  // the agent can opt into recompute — the M5.3 verification requires exactly this.
  const a = anchors({ ewt_rate_used: "0.1000" });
  const c = current({ ewt_rate: "0.0500" });
  assert.equal(isStaleBasis(a, c), true);
  assert.deepEqual(staleBasisReasons(a, c), ["ewt_rate"]);
  assert.match(staleBasisExplanation(a, c) ?? "", /EWT 10% → now 5%/);
});

test("a VAT rate change flags the row", () => {
  const a = anchors({ vat_rate_used: "0.1200" });
  const c = current({ vat_rate: "0.1000" });
  assert.deepEqual(staleBasisReasons(a, c), ["vat_rate"]);
});

test("multiple drifted anchors are all reported, in a stable order", () => {
  const a = anchors({ vat_basis_used: "inclusive", ewt_rate_used: "0.1000", vat_rate_used: "0.1200" });
  const c = current({ vat_basis: "n_a", ewt_rate: "0.0500", vat_rate: "0.1000" });
  assert.deepEqual(staleBasisReasons(a, c), ["vat_basis", "ewt_rate", "vat_rate"]);
  const explanation = staleBasisExplanation(a, c) ?? "";
  assert.match(explanation, /VAT basis/);
  assert.match(explanation, /EWT 10% → now 5%/);
  assert.match(explanation, /VAT 12% → now 10%/);
});
