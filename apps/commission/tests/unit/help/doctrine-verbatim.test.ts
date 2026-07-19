import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { HELP_CONTENT_BUNDLE } from "@/lib/help/seed-content";

/**
 * M10.1 — the doctrine-verbatim guard (rule 12, PRD §6.3/§6.5; DoD "every P0–P11
 * article byte-matches PRD §6.3").
 *
 * The seeded bundle (src/lib/help/seed-content.ts) is generated from the PRD; this
 * test RE-PARSES the PRD independently and asserts byte-equality, so any later
 * hand-edit that drifts the doctrine from the source of truth fails CI. No DB is
 * touched (CI never has one) — the seed module IS the runtime content, and the live
 * check separately proves the DB-seeded copy equals it.
 */

const PRD = readFileSync(
  path.resolve(import.meta.dirname, "../../../discovery/source/M10_PRD.md"),
  "utf8"
);
const LINES = PRD.split("\n");

// The Pn → article-key map (must mirror scripts/gen-help-content.mjs ARTICLE_META).
const PKEY_TO_KEY: Record<string, string> = {
  P0: "philosophy",
  P1: "property-vat",
  P2: "vat-inclusive-billing",
  P3: "agent-representation",
  P4: "client-counterparty",
  P5: "what-to-book",
  P6: "corrections-doctrine",
  P7: "booked-vs-collectible",
  P8: "closed-vs-cancelled",
  P9: "balance-basis-taxes",
  P10: "mode-of-payment",
  P11: "ewt-5-option",
};

function parseDoctrine(): { pkey: string; title: string; body: string }[] {
  const out: { pkey: string; title: string; body: string }[] = [];
  for (let i = 0; i < LINES.length; i++) {
    const m = /^\*\*(P\d+)\s+·\s+(.+?)\*\*\s+—\s+.*$/.exec(LINES[i]);
    if (!m) continue;
    const body: string[] = [];
    let j = i + 1;
    while (j < LINES.length && LINES[j].trim() === "") j++;
    while (j < LINES.length && LINES[j].startsWith(">")) {
      body.push(LINES[j].replace(/^>\s?/, ""));
      j++;
    }
    out.push({ pkey: m[1], title: m[2].trim(), body: body.join("\n") });
  }
  return out;
}

function parseGlossary(): { term: string; def: string }[] {
  const out: { term: string; def: string }[] = [];
  let inGloss = false;
  for (const line of LINES) {
    if (line.startsWith("### 6.5")) { inGloss = true; continue; }
    if (inGloss && line.startsWith("### ")) break;
    if (!inGloss) continue;
    const row = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!row) continue;
    const term = row[1].trim();
    if (term === "Term" || /^-+$/.test(term)) continue;
    out.push({ term, def: row[2].trim() });
  }
  return out;
}

function slugify(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

test("all 12 doctrines are present and parsed from the PRD", () => {
  const doctrine = parseDoctrine();
  assert.equal(doctrine.length, 12, "PRD §6.3 should define exactly P0–P11");
});

test("each P0–P11 article body byte-matches PRD §6.3 verbatim (rule 12)", () => {
  const doctrine = parseDoctrine();
  for (const d of doctrine) {
    const key = PKEY_TO_KEY[d.pkey];
    assert.ok(key, `no key mapping for ${d.pkey}`);
    const article = HELP_CONTENT_BUNDLE.articles.find((a) => a.key === key);
    assert.ok(article, `seeded article missing for ${d.pkey} (${key})`);
    assert.equal(
      article!.bodyMd,
      d.body,
      `${d.pkey} body drifted from PRD §6.3 (rule 12 — doctrine is verbatim)`
    );
    assert.equal(article!.title, d.title, `${d.pkey} title drifted from PRD §6.3`);
  }
});

test("each glossary definition byte-matches PRD §6.5 verbatim", () => {
  const glossary = parseGlossary();
  assert.equal(glossary.length, 16, "PRD §6.5 should define 16 glossary terms");
  for (const g of glossary) {
    const key = slugify(g.term);
    const entry = HELP_CONTENT_BUNDLE.glossary.find((e) => e.key === key);
    assert.ok(entry, `seeded glossary entry missing for "${g.term}" (${key})`);
    assert.equal(entry!.term, g.term, `glossary term drifted for ${key}`);
    assert.equal(
      entry!.definitionMd,
      g.def,
      `glossary definition drifted from PRD §6.5 for "${g.term}"`
    );
  }
});

test("the legend article embeds the verbatim §6.2 legend line", () => {
  // The §6.2 legend blockquote (first after the heading).
  let legendLine = "";
  for (let i = 0; i < LINES.length; i++) {
    if (LINES[i].startsWith("### 6.2")) {
      let j = i + 1;
      while (j < LINES.length && !LINES[j].startsWith(">")) j++;
      legendLine = LINES[j].replace(/^>\s?/, "");
      break;
    }
  }
  assert.ok(legendLine.length > 0, "could not find §6.2 legend line in the PRD");
  const legend = HELP_CONTENT_BUNDLE.articles.find((a) => a.key === "legend");
  assert.ok(legend, "seeded legend article missing");
  assert.ok(
    legend!.bodyMd.includes(legendLine),
    "legend article must contain the verbatim §6.2 legend line"
  );
});
