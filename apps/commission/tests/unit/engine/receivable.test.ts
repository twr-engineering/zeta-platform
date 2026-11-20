import test from "node:test";
import assert from "node:assert/strict";

import {
  bookedNetGci,
  defaultTotalCollectible,
  totalCollectible,
} from "../../../src/lib/engine/index.ts";

/**
 * M4 Rule K helpers — the mirror (K.1) and the override precedence (K.2). The
 * full-precision default itself is proven in deal.test.ts; here we pin that the
 * override wins when set, the default wins otherwise, and neither introduces new
 * arithmetic (just a scale normalise). This is the reference for the DB's
 * generated total_collectible column.
 */

test("K.1 — booked mirrors the deal's net_gci exactly", () => {
  assert.equal(bookedNetGci({ net_gci: "800000.00" }), "800000.00");
});

test("K.2 — default passes the engine's default_total_collectible through", () => {
  assert.equal(
    defaultTotalCollectible({ default_total_collectible: "875000.00" }),
    "875000.00"
  );
});

test("K.2 — override wins when set (D004: confirmed 875,000 over booked default)", () => {
  // Even when default and override coincide numerically, the override path is used.
  assert.equal(totalCollectible("875000.00", "875000.00"), "875000.00");
  // A genuine override that differs from the default.
  assert.equal(totalCollectible("850000.00", "875000.00"), "850000.00");
});

test("K.2 — default wins when no override is entered (null clears back to default)", () => {
  assert.equal(totalCollectible(null, "354591.84"), "354591.84");
});

test("K.2 — override is scale-normalised, never re-arithmetic'd", () => {
  assert.equal(totalCollectible("875000", "800000.00"), "875000.00");
});
