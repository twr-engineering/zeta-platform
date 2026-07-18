import test from "node:test";
import assert from "node:assert/strict";

import { parseSearchQuery } from "../../../src/lib/search/params.ts";

// PRD §3.1 / Rules 3/6/9/12 — query parsing + the filter-applicability matrix.

const parse = (qs: string) => parseSearchQuery(new URLSearchParams(qs));

test("defaults — empty query is Deals, all years, no filters, page 1/50", () => {
  const { query } = parse("");
  assert.equal(query.source, "deals");
  assert.equal(query.year, null);
  assert.equal(query.dealCode, null);
  assert.equal(query.status, null);
  assert.equal(query.onlyWithBalance, false);
  assert.equal(query.text, "");
  assert.equal(query.sort, "default");
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 50);
});

test("source — unknown value falls back to deals", () => {
  assert.equal(parse("source=all").query.source, "deals");
  assert.equal(parse("source=collectibles").query.source, "collectibles");
  assert.equal(parse("source=payments").query.source, "payments");
});

test("year — 4-digit only; 'all'/garbage → null (Rule 3)", () => {
  assert.equal(parse("year=2026").query.year, 2026);
  assert.equal(parse("year=all").query.year, null);
  assert.equal(parse("year=26").query.year, null);
  assert.equal(parse("year=twenty").query.year, null);
});

test("applicability matrix — status/only_with_balance apply to Collectibles only (Rule 6)", () => {
  const coll = parse("source=collectibles&status=open&only_with_balance=true").query;
  assert.equal(coll.status, "open");
  assert.equal(coll.onlyWithBalance, true);

  // Same params on Deals / Payments are dropped server-side.
  const deals = parse("source=deals&status=open&only_with_balance=true").query;
  assert.equal(deals.status, null);
  assert.equal(deals.onlyWithBalance, false);

  const pay = parse("source=payments&status=closed&only_with_balance=true").query;
  assert.equal(pay.status, null);
  assert.equal(pay.onlyWithBalance, false);
});

test("status — invalid enum on collectibles → null", () => {
  assert.equal(parse("source=collectibles&status=paid").query.status, null);
});

test("deal_code — trimmed; blank → null; unknown code preserved (Rule 9)", () => {
  assert.equal(parse("deal_code=%20D021%20").query.dealCode, "D021");
  assert.equal(parse("deal_code=%20%20").query.dealCode, null);
  assert.equal(parse("deal_code=D999").query.dealCode, "D999");
});

test("text — accepts `text` or `q`, trims, caps at 200 with truncation flag (Rule 12)", () => {
  assert.equal(parse("text=%20ventura%20").query.text, "ventura");
  assert.equal(parse("q=lainie").query.text, "lainie");

  const long = "x".repeat(250);
  const parsed = parse(`text=${long}`);
  assert.equal(parsed.query.text.length, 200);
  assert.equal(parsed.textTruncated, true);

  assert.equal(parse("text=short").textTruncated, false);
});

test("sort — unknown preset falls back to default", () => {
  assert.equal(parse("sort=amount_desc").query.sort, "amount_desc");
  assert.equal(parse("sort=date_oldest").query.sort, "date_oldest");
  assert.equal(parse("sort=relevance").query.sort, "default");
});

test("pagination — positive ints only; page_size clamped to 200", () => {
  assert.equal(parse("page=3&page_size=25").query.page, 3);
  assert.equal(parse("page=3&page_size=25").query.pageSize, 25);
  assert.equal(parse("page=0").query.page, 1);
  assert.equal(parse("page=-2").query.page, 1);
  assert.equal(parse("page_size=5000").query.pageSize, 200);
  assert.equal(parse("page_size=abc").query.pageSize, 50);
});
