import test from "node:test";
import assert from "node:assert/strict";

import {
  daysInYear,
  dayAccuratePace,
  deriveAnnualTarget,
  getAnnualTarget,
  ordinalDayInYear,
  paceFraction,
  roundUp10k,
} from "../../../src/lib/dashboard/target.ts";
import { manilaDate } from "../../../src/lib/date/manila.ts";

/**
 * M6 §2 target + pace — the pure math, clock-injectable. Every figure is asserted
 * against the v30.20 worked examples to the centavo (PRD §3.3 / Milestones test plan
 * items 2–4).
 */

// --- ROUNDUP_10K -------------------------------------------------------------

test("ROUNDUP_10K always rounds UP to the next ₱10,000", () => {
  // 11,500,000 ÷ 0.68 = 16,911,764.7059 → 16,920,000 (never 16,910,000).
  assert.equal(roundUp10k("16911764.7059"), "16920000.00");
  // An exact multiple is unchanged.
  assert.equal(roundUp10k("16920000"), "16920000.00");
  // Any remainder rounds up.
  assert.equal(roundUp10k("16910000.01"), "16920000.00");
  assert.equal(roundUp10k("0.01"), "10000.00");
  assert.equal(roundUp10k("0"), "0.00");
});

// --- derived target ----------------------------------------------------------

test("deriveAnnualTarget = ROUNDUP_10K(NIT ÷ (1 − opex − cos))", () => {
  assert.equal(
    deriveAnnualTarget({ netIncomeTarget: "11500000", opexPct: "0.22", cosPct: "0.10" }),
    "16920000.00"
  );
});

test("deriveAnnualTarget defaults blank opex/cos to 0.22 / 0.10 (M3 rule)", () => {
  assert.equal(
    deriveAnnualTarget({ netIncomeTarget: "11500000", opexPct: null, cosPct: null }),
    "16920000.00"
  );
});

test("deriveAnnualTarget returns null for no row and for a degenerate denominator", () => {
  assert.equal(deriveAnnualTarget(null), null);
  // opex + cos ≥ 1 ⇒ non-positive net-income % ⇒ no target (not ∞).
  assert.equal(
    deriveAnnualTarget({ netIncomeTarget: "11500000", opexPct: "0.60", cosPct: "0.50" }),
    null
  );
});

test("getAnnualTarget — override wins, else derivation, else null", () => {
  const row = { netIncomeTarget: "11500000", opexPct: "0.22", cosPct: "0.10" };
  assert.equal(getAnnualTarget("15000000.00", row), "15000000.00"); // override
  assert.equal(getAnnualTarget(null, row), "16920000.00"); // derived
  assert.equal(getAnnualTarget(null, null), null); // "—", no error
});

// --- calendar / ordinal ------------------------------------------------------

test("daysInYear — 366 in a leap year, else 365", () => {
  assert.equal(daysInYear(2026), 365);
  assert.equal(daysInYear(2028), 366); // leap
  assert.equal(daysInYear(2000), 366); // divisible by 400
  assert.equal(daysInYear(1900), 365); // divisible by 100 not 400
});

test("ordinalDayInYear — Jan 1 = 1, 2026-07-17 = 198, Dec 31 = 365", () => {
  assert.equal(ordinalDayInYear(2026, "2026-01-01"), 1);
  assert.equal(ordinalDayInYear(2026, "2026-07-17"), 198); // 181 + 17
  assert.equal(ordinalDayInYear(2026, "2026-12-31"), 365);
  assert.equal(ordinalDayInYear(2028, "2028-12-31"), 366); // leap
  assert.equal(ordinalDayInYear(2028, "2028-03-01"), 61); // 31 + 29 + 1
});

// --- pace --------------------------------------------------------------------

test("pace fraction clamps to [0,1] across / past / future years", () => {
  assert.equal(paceFraction(2026, "2026-07-17").toFixed(10), "0.5424657534");
  // A fully past dashboard year (today is in a later year) → 1.
  assert.equal(paceFraction(2025, "2026-07-17").toString(), "1");
  // A future dashboard year (today precedes it) → 0.
  assert.equal(paceFraction(2027, "2026-07-17").toString(), "0");
});

test("dayAccuratePace — the v30.20 worked figures to the centavo", () => {
  // 2026-07-17 → 198 ÷ 365 × 16,920,000 = 9,178,520.55.
  assert.equal(dayAccuratePace("16920000.00", 2026, "2026-07-17"), "9178520.55");
  // Jan 1 → 1 ÷ 365 × 16,920,000 = 46,356.16.
  assert.equal(dayAccuratePace("16920000.00", 2026, "2026-01-01"), "46356.16");
  // Dec 31 → 100% → the whole target.
  assert.equal(dayAccuratePace("16920000.00", 2026, "2026-12-31"), "16920000.00");
  // Leap-year denominator: 2028-12-31 = 366 ÷ 366 = 100%.
  assert.equal(dayAccuratePace("16920000.00", 2028, "2028-12-31"), "16920000.00");
  // Override 15,000,000 → 198 ÷ 365 × 15,000,000 = 8,136,986.30 (AC3).
  assert.equal(dayAccuratePace("15000000.00", 2026, "2026-07-17"), "8136986.30");
});

test("dayAccuratePace — a null target yields null (line suppressed, no error)", () => {
  assert.equal(dayAccuratePace(null, 2026, "2026-07-17"), null);
});

test("pace 'today' is Asia/Manila civil — a UTC evening is already the next Manila day", () => {
  // 2026-07-16 17:00 UTC = 2026-07-17 01:00 Manila → day 198, not 197.
  const civil = manilaDate(new Date("2026-07-16T17:00:00Z"));
  assert.equal(civil, "2026-07-17");
  assert.equal(ordinalDayInYear(2026, civil), 198);
});
