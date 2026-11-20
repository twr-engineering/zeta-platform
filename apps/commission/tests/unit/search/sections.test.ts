import test from "node:test";
import assert from "node:assert/strict";

import {
  allSectionQueries,
  buildSectionQuery,
} from "../../../src/lib/search/sections.ts";
import {
  ALL_TAB_SECTION_LIMIT,
  SEARCH_SECTIONS,
  type SearchQuery,
} from "../../../src/lib/search/types.ts";

// M9.4 — the unified "All" tab's per-section query derivation (Rule 2 / PRD §3.1).
// The All tab fans one query into three source queries carrying only the shared
// applicable filters (year, deal ID, text); Collectibles-scoped filters and sort are
// NOT global All-tab controls, so every section query resets them.

const allQuery: SearchQuery = {
  source: "all",
  year: 2026,
  dealCode: "D021",
  status: null,
  onlyWithBalance: false,
  text: "ventura",
  sort: "default",
  page: 1,
  pageSize: 50,
};

test("buildSectionQuery — carries the shared filters, pins the concrete source", () => {
  const deals = buildSectionQuery(allQuery, "deals");
  assert.equal(deals.source, "deals");
  assert.equal(deals.year, 2026);
  assert.equal(deals.dealCode, "D021");
  assert.equal(deals.text, "ventura");
  assert.equal(deals.page, 1);
  assert.equal(deals.pageSize, ALL_TAB_SECTION_LIMIT);
});

test("buildSectionQuery — clears Collectibles-scoped filters + forces default sort", () => {
  // Even if a hand-crafted All query somehow carried status/balance/sort, a section
  // query must not apply them globally (they stay Collectibles-scoped within their tab).
  const leaky: SearchQuery = {
    ...allQuery,
    status: "open",
    onlyWithBalance: true,
    sort: "amount_desc",
  };
  for (const source of SEARCH_SECTIONS) {
    const q = buildSectionQuery(leaky, source);
    assert.equal(q.status, null, `${source} status cleared`);
    assert.equal(q.onlyWithBalance, false, `${source} balance cleared`);
    assert.equal(q.sort, "default", `${source} sort reset`);
    assert.equal(q.source, source);
  }
});

test("buildSectionQuery — pageSize override (the export pager pages the full set)", () => {
  assert.equal(buildSectionQuery(allQuery, "payments", 1000).pageSize, 1000);
});

test("allSectionQueries — three sections in §3.2 order (Deals, Collectibles, Payments)", () => {
  const sections = allSectionQueries(allQuery);
  assert.deepEqual(
    sections.map((s) => s.source),
    ["deals", "collectibles", "payments"]
  );
  // Each carries the shared filters; each is a distinct concrete source.
  for (const { source, query } of sections) {
    assert.equal(query.source, source);
    assert.equal(query.text, "ventura");
    assert.equal(query.year, 2026);
  }
});
