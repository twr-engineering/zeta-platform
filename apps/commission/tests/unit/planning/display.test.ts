import test from "node:test";
import assert from "node:assert/strict";

import {
  assumptionSourceLabel,
  funnelRatePercentLabel,
  ratePercentInputValue,
} from "@/lib/planning";

/** M3.3 — the pure display helpers behind the planning screen's source labels and
 * whole-percent rate rendering (PRD §6). */

test("assumptionSourceLabel names the basis vs a per-year override (FR-M3-05)", () => {
  assert.equal(assumptionSourceLabel("all_time", 2026), "All-time realized");
  assert.equal(assumptionSourceLabel("override", 2027), "Override for 2027");
});

test("funnelRatePercentLabel renders a stored decimal rate as a whole percent (§6)", () => {
  assert.equal(funnelRatePercentLabel("0.25"), "25%");
  assert.equal(funnelRatePercentLabel("0.70"), "70%");
  assert.equal(funnelRatePercentLabel("0.10"), "10%");
});

test("ratePercentInputValue seeds a blue rate input with the whole-percent number", () => {
  assert.equal(ratePercentInputValue("0.25"), "25");
  assert.equal(ratePercentInputValue("0.70"), "70");
  assert.equal(ratePercentInputValue("0.10"), "10");
});
