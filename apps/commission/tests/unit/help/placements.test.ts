import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  PLACEMENT_REGISTRY,
  articleForPlacement,
  fallbackArticle,
  getArticle,
  getGlossaryEntry,
} from "@/lib/help/placements";
import { HELP_CONTENT_BUNDLE } from "@/lib/help/seed-content";

/**
 * M10.1 — placement registry + resolver (FR-M10-11). Guards that every registered
 * placement resolves to a seeded article, that missing keys fall back gracefully
 * (never a broken popover), and that the legend explainer + doctrine placements wire
 * to the right copy.
 */

test("every article placement is documented in the registry", () => {
  for (const article of HELP_CONTENT_BUNDLE.articles) {
    for (const p of article.placements) {
      assert.ok(
        PLACEMENT_REGISTRY[p],
        `placement "${p}" (article ${article.key}) is not in PLACEMENT_REGISTRY`
      );
    }
  }
});

test("every registry placement resolves to a real seeded article", () => {
  for (const placement of Object.keys(PLACEMENT_REGISTRY)) {
    const article = articleForPlacement(HELP_CONTENT_BUNDLE, placement);
    assert.ok(
      article.placements.includes(placement),
      `registry placement "${placement}" did not resolve to an article that serves it`
    );
  }
});

test("legend explainer placement resolves to the verbatim legend article", () => {
  const article = articleForPlacement(HELP_CONTENT_BUNDLE, "legend.explainer");
  assert.equal(article.key, "legend");
  assert.ok(
    article.bodyMd.includes("Only blue cells editable. Blue = input, Black = formula, Green = linked from another tab."),
    "legend explainer must carry the verbatim legend line"
  );
});

test("P2 commission-basis placement resolves to the VAT-inclusive doctrine", () => {
  const article = articleForPlacement(HELP_CONTENT_BUNDLE, "deal-form.commission-basis");
  assert.equal(article.key, "vat-inclusive-billing");
  assert.ok(article.bodyMd.includes("the engine divides by 1.12 to get your income"));
});

test("a missing article key falls back to a glossary-linking help stub", () => {
  const fb = getArticle(HELP_CONTENT_BUNDLE, "does-not-exist");
  assert.equal(fb.key, "does-not-exist");
  assert.ok(fb.bodyMd.includes("(/glossary)"), "fallback must link the glossary");
  assert.deepEqual(fb.placements, []);
});

test("a missing placement also falls back (never a broken popover)", () => {
  const fb = articleForPlacement(HELP_CONTENT_BUNDLE, "nowhere.at-all");
  assert.equal(fb.title, fallbackArticle("nowhere.at-all").title);
});

test("glossary entries resolve by key and unknown keys return null", () => {
  const gci = getGlossaryEntry(HELP_CONTENT_BUNDLE, "gci");
  assert.ok(gci && gci.term === "GCI");
  assert.equal(getGlossaryEntry(HELP_CONTENT_BUNDLE, "nope"), null);
});
