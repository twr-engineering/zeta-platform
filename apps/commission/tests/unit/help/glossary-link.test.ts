import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildGlossaryIndex, linkifyRun } from "@/lib/help/glossary-link";
import type { GlossaryEntry } from "@/lib/help/types";

/**
 * M10.1 — glossary auto-linking (FR-M10-16). Pure segment transform: the render layer
 * maps link segments to anchors. Guards the matching rules — longest-first, word-
 * bounded, once per key, alias-splitting.
 */

const GLOSSARY: GlossaryEntry[] = [
  { key: "gci", term: "GCI", definitionMd: "", relatedKeys: [] },
  { key: "net-gci", term: "NET GCI", definitionMd: "", relatedKeys: [] },
  { key: "ewt", term: "EWT", definitionMd: "", relatedKeys: [] },
  {
    key: "referrer-vs-referral-out",
    term: "Referrer vs Referral Out",
    definitionMd: "",
    relatedKeys: [],
  },
];

test("index is sorted longest-alias-first and splits vs/slash terms", () => {
  const index = buildGlossaryIndex(GLOSSARY);
  const aliases = index.map((a) => a.alias);
  // "Referral Out" (12) and "NET GCI" (7) come before "EWT"/"GCI" (3).
  assert.ok(aliases.indexOf("Referral Out") < aliases.indexOf("GCI"));
  // "Referrer vs Referral Out" split into two aliases pointing at one key.
  assert.ok(aliases.includes("Referrer"));
  assert.ok(aliases.includes("Referral Out"));
});

test("longer term wins over a shorter one starting at the same place", () => {
  const index = buildGlossaryIndex(GLOSSARY);
  const used = new Set<string>();
  const segs = linkifyRun("Booked NET GCI is earned", index, used);
  const link = segs.find((s) => s.kind === "link");
  assert.ok(link && link.kind === "link");
  assert.equal(link.value, "NET GCI");
  assert.equal(link.key, "net-gci");
});

test("matching is word-bounded — no link inside a larger word", () => {
  const index = buildGlossaryIndex(GLOSSARY);
  const used = new Set<string>();
  const segs = linkifyRun("the EWTx code is not a term", index, used);
  assert.ok(segs.every((s) => s.kind === "text"), "EWTx must not link");
});

test("each key links at most once per shared `used` set", () => {
  const index = buildGlossaryIndex(GLOSSARY);
  const used = new Set<string>();
  const first = linkifyRun("EWT then EWT again", index, used);
  const links = first.filter((s) => s.kind === "link");
  assert.equal(links.length, 1, "second EWT should not re-link");
  // Same set carried to another run keeps EWT un-linked.
  const second = linkifyRun("and EWT once more", index, used);
  assert.ok(second.every((s) => s.kind === "text"));
});

test("multiple distinct terms in one run all link", () => {
  const index = buildGlossaryIndex(GLOSSARY);
  const used = new Set<string>();
  const segs = linkifyRun("GCI less EWT withheld", index, used);
  const keys = segs.filter((s) => s.kind === "link").map((s) => (s.kind === "link" ? s.key : ""));
  assert.deepEqual(keys.sort(), ["ewt", "gci"]);
});

test("empty text yields no segments", () => {
  const index = buildGlossaryIndex(GLOSSARY);
  assert.deepEqual(linkifyRun("", index, new Set()), []);
});
