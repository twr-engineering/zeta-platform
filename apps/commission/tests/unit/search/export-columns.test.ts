import { strict as assert } from "node:assert";
import { test } from "node:test";

import { toCsv, type ExportColumn, type ExportDataset } from "@/lib/export/format";
import {
  searchExportName,
  searchExportSpec,
} from "@/lib/search/export-columns";
import type {
  CollectibleSearchRow,
  DealSearchRow,
  PaymentSearchRow,
  SearchQuery,
  SearchResultRow,
} from "@/lib/search/types";

/**
 * M9.3 — the search export projection (§3.2, FR-M9-11, AC11), pinned pure.
 *
 * The columns ARE the on-screen columns; a drift here is a download that no longer
 * matches the screen. Money stays the exact source string (M9 recomputes nothing).
 */

const baseQuery: SearchQuery = {
  source: "deals",
  year: null,
  dealCode: null,
  status: null,
  onlyWithBalance: false,
  text: "",
  sort: "default",
  page: 1,
  pageSize: 50,
};

const asDataset = (
  source: SearchQuery["source"],
  rows: SearchResultRow[]
): ExportDataset<SearchResultRow> => {
  const { sheet, columns } = searchExportSpec(source);
  return { name: sheet, sheet, columns: columns as readonly ExportColumn<SearchResultRow>[], rows };
};

// --- columns / headers ------------------------------------------------------

test("Deals columns match §3.2 header + order (mirror the on-screen table)", () => {
  const { columns } = searchExportSpec("deals");
  assert.deepEqual(
    columns.map((c) => c.header),
    ["Deal ID", "Date", "Transaction", "Deal Type", "Developer", "Client", "Property", "NET GCI"]
  );
});

test("Payments columns match §3.2 header + order", () => {
  const { columns } = searchExportSpec("payments");
  assert.deepEqual(
    columns.map((c) => c.header),
    ["Date", "Deal ID", "Client", "Property", "Gross", "Net of VAT", "Net Cash"]
  );
});

test("Collectibles columns match §3.2 header + order", () => {
  const { columns } = searchExportSpec("collectibles");
  assert.deepEqual(
    columns.map((c) => c.header),
    ["Deal ID", "Client", "Property", "Deal Type", "Total Collectible", "Collected", "Balance", "Status"]
  );
});

// --- cell values: labels + exact money --------------------------------------

test("Deals row → human enum labels + exact NET GCI string (no money re-derivation)", () => {
  const deal: DealSearchRow = {
    id: "1",
    dealCode: "D013",
    bookedDate: "2026-05-01",
    transactionType: "sale",
    dealType: "resale",
    developerName: null,
    clientName: "Lainie Vale",
    propertyDetails: "Ventura Residences",
    netGci: "906752.23",
    bookedYear: 2026,
    archived: false,
  };
  const csv = toCsv(asDataset("deals", [deal]));
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(lines[1], "D013,2026-05-01,Sale,Resale,,Lainie Vale,Ventura Residences,906752.23");
});

test("Collectibles row → status label + null balance renders as an empty cell", () => {
  const rec: CollectibleSearchRow = {
    id: "1",
    dealId: "d1",
    dealCode: "D021",
    clientName: "Abrown Co",
    propertyDetails: "Tower 2",
    dealType: "developer",
    totalCollectible: "354591.84",
    collectedNet: "44642.86",
    balance: null,
    status: "open",
    bookedYear: 2026,
    archived: true,
  };
  const csv = toCsv(asDataset("collectibles", [rec]));
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  // Balance is the 7th column → empty between "44642.86" and "Open".
  assert.equal(lines[1], "D021,Abrown Co,Tower 2,Developer,354591.84,44642.86,,Open");
});

test("Payments row → exact split strings verbatim", () => {
  const pay: PaymentSearchRow = {
    id: "1",
    dealId: "d1",
    paymentDate: "2026-07-09",
    dealCode: "D021",
    clientName: "Abrown Co",
    propertyDetails: "Tower 2",
    gross: "50000.00",
    netOfVat: "44642.86",
    netCash: "45535.71",
    yearPaid: 2026,
    archived: false,
  };
  const csv = toCsv(asDataset("payments", [pay]));
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(lines[1], "2026-07-09,D021,Abrown Co,Tower 2,50000.00,44642.86,45535.71");
});

// --- filename stem ----------------------------------------------------------

test("filename stem — bare source", () => {
  assert.equal(searchExportName(baseQuery), "search-deals");
});

test("filename stem — collectibles Open + with-balance", () => {
  assert.equal(
    searchExportName({ ...baseQuery, source: "collectibles", status: "open", onlyWithBalance: true }),
    "search-collectibles-open-with-balance"
  );
});

test("filename stem — year + text + non-default sort, in stable order", () => {
  assert.equal(
    searchExportName({ ...baseQuery, source: "payments", year: 2026, text: "Lainie Vale", sort: "amount_desc" }),
    "search-payments-2026-lainie-vale-amount-desc"
  );
});

test("filename stem — status/balance never leak onto a non-collectibles source (Rule 6)", () => {
  // A hand-crafted query object with stale collectibles fields on a deals source.
  assert.equal(
    searchExportName({ ...baseQuery, source: "deals", status: "open", onlyWithBalance: true }),
    "search-deals"
  );
});

test("filename stem — All-tab workbook carries the shared filters (M9.4)", () => {
  // The combined multi-sheet XLSX names itself `search-all-…`; only the shared filters
  // (year, deal_code, text) appear — status/balance are Collectibles-scoped, never here.
  assert.equal(searchExportName({ ...baseQuery, source: "all" }), "search-all");
  assert.equal(
    searchExportName({ ...baseQuery, source: "all", year: 2026, text: "Ventura" }),
    "search-all-2026-ventura"
  );
});
