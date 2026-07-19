import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { EMPTY_STATE_REGISTRY } from "@/lib/help/empty-states";
import { EMPTY_STATE_MESSAGE } from "@/lib/search/types";

/**
 * M10.4 — the empty-state registry coverage check (FR-M10-14, AC10; DoD:
 * "automated registry-coverage test fails the build if a module surface lacks its
 * empty state").
 *
 * The registry (src/lib/help/empty-states.ts) is the catalogue of every M1–M9
 * surface from PRD §6.4. This test reads each entry's source file and asserts the
 * surface still renders its empty-state marker (the stable `testId`). Deleting or
 * un-wiring a surface's empty state drops its marker and fails CI here — exactly the
 * guard AC10 asks for. No DB, no money.
 */

const ROOT = path.resolve(import.meta.dirname, "../../..");

const entries = Object.entries(EMPTY_STATE_REGISTRY);

test("§6.4 registry covers all nine M1–M9 surfaces", () => {
  const modules = new Set(entries.map(([, e]) => e.module));
  for (const m of ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"]) {
    assert.ok(modules.has(m), `§6.4 registry is missing an empty state for ${m}`);
  }
  assert.equal(entries.length, 9, "expected exactly nine §6.4 surfaces");
});

test("every registry entry carries non-empty copy, action and marker", () => {
  for (const [key, e] of entries) {
    assert.ok(e.copy.trim().length > 0, `${key}: empty copy`);
    assert.ok(e.actions.trim().length > 0, `${key}: no filling action`);
    assert.ok(e.testId.trim().length > 0, `${key}: no testId marker`);
    assert.ok(e.sourceFile.trim().length > 0, `${key}: no source file`);
  }
});

test("each surface's source file renders its empty-state marker", () => {
  for (const [key, e] of entries) {
    const src = readFileSync(path.join(ROOT, e.sourceFile), "utf8");
    const rendered =
      src.includes(`data-testid="${e.testId}"`) || src.includes(`testId="${e.testId}"`);
    assert.ok(
      rendered,
      `${key} (${e.module}): ${e.sourceFile} no longer renders its empty state (testId "${e.testId}")`
    );
  }
});

test("M9 filtered-empty keeps the sheet's verbatim message (Rule 8 / AC9)", () => {
  assert.equal(EMPTY_STATE_MESSAGE, "No matching records — adjust your filters above.");
  const src = readFileSync(
    path.join(ROOT, EMPTY_STATE_REGISTRY.search.sourceFile),
    "utf8"
  );
  // The console renders the verbatim constant (via result.emptyMessage) and the
  // fresh-view line; both paths live in the search source.
  assert.ok(
    src.includes("emptyMessage") && src.includes("Nothing to search yet."),
    "search console must render both the verbatim filtered message and the fresh state"
  );
});
