import test from "node:test";
import assert from "node:assert/strict";

import {
  sourcePerformance,
  type SourceLeadSource,
} from "../../../src/lib/source-performance/build.ts";
import {
  sourcePerformanceToRows,
  SOURCE_PERFORMANCE_COLUMNS,
  type SourceExportRow,
} from "../../../src/lib/source-performance/export-rows.ts";
import type { ProjectionReceivable } from "../../../src/lib/receivables/projections.ts";

/**
 * M7.2 — the Source Performance export flatten (FR-M7-08 / AC9). The flatten never
 * recomputes: it maps the M7.1 report's rows + the pinned TOTAL into export rows,
 * preserving every ₱ string verbatim and formatting the 6-dp ratios to the on-screen
 * 2-dp percent (a null ratio → the "—" the table shows). This proves the download ties
 * to the screen to the centavo — including the Referral row's 109.38% pass-through
 * divergence and the zero-deal row's undefined Avg / % Collected.
 */

const SRC = {
  youtube: "src-youtube",
  referral: "src-referral",
  tiktok: "src-tiktok", // active, zero in-scope deals → a row of zeros / em-dashes
} as const;

const LEAD_SOURCES: SourceLeadSource[] = [
  { id: SRC.youtube, name: "YouTube", archived_at: null, sort_order: 0 },
  { id: SRC.referral, name: "Referral", archived_at: null, sort_order: 1 },
  { id: SRC.tiktok, name: "TikTok", archived_at: null, sort_order: 2 },
];

function rcv(p: {
  code: string;
  source: string;
  type: "developer" | "resale" | "n_a";
  booked: string;
  collected: string;
  balance: string;
  status: "open" | "closed" | "cancelled";
}): ProjectionReceivable {
  return {
    id: `rid-${p.code}`,
    deal_id: `id-${p.code}`,
    deal_code: p.code,
    client_name: `Client ${p.code}`,
    property_details: `Unit ${p.code}`,
    deal_type: p.type,
    developer_id: null,
    lead_source_id: p.source,
    booked_year: 2026,
    status: p.status,
    booked_net_gci: p.booked,
    total_collectible: p.booked,
    collected_net: p.collected,
    balance: p.balance,
    variance: null,
    written_off: null,
    pct_collected: null,
    last_payment_date: null,
    months_idle: null,
    age_months: null,
    days_to_first_release: null,
    confirmed_collectible: null,
    next_action_note: null,
    archived_at: null,
    developer: null,
  } as ProjectionReceivable;
}

// YouTube (7 deals — the §9 fixture) + Referral (D004 pass-through) + TikTok (zero deals).
const RECEIVABLES: ProjectionReceivable[] = [
  rcv({ code: "D006", source: SRC.youtube, type: "resale", booked: "352500.00", collected: "352500.00", balance: "0.00", status: "closed" }),
  rcv({ code: "D011", source: SRC.youtube, type: "developer", booked: "155803.57", collected: "0.00", balance: "155803.57", status: "open" }),
  rcv({ code: "D012", source: SRC.youtube, type: "developer", booked: "206696.43", collected: "0.00", balance: "206696.43", status: "open" }),
  rcv({ code: "D013", source: SRC.youtube, type: "developer", booked: "906752.23", collected: "0.00", balance: "906752.23", status: "open" }),
  rcv({ code: "D014", source: SRC.youtube, type: "developer", booked: "401965.08", collected: "0.00", balance: "401965.08", status: "open" }),
  rcv({ code: "D015", source: SRC.youtube, type: "developer", booked: "77232.14", collected: "0.00", balance: "77232.14", status: "open" }),
  rcv({ code: "D021", source: SRC.youtube, type: "developer", booked: "354591.84", collected: "44642.86", balance: "309948.98", status: "open" }),
  rcv({ code: "D004", source: SRC.referral, type: "resale", booked: "800000.00", collected: "875000.00", balance: "0.00", status: "closed" }),
];

const report = sourcePerformance(RECEIVABLES, LEAD_SOURCES, "all");
const rows = sourcePerformanceToRows(report);

/** The value the column's writer emits for a row — money passes through, %/text formats. */
function cell(row: SourceExportRow, header: string): unknown {
  const col = SOURCE_PERFORMANCE_COLUMNS.find((c) => c.header === header);
  assert.ok(col, `column "${header}" exists`);
  return col!.value(row);
}

function findRow(source: string): SourceExportRow {
  const row = rows.find((r) => r.source === source);
  assert.ok(row, `export has a "${source}" row`);
  return row!;
}

test("one export row per visible source, TOTAL appended last", () => {
  assert.equal(rows.length, report.rows.length + 1);
  assert.equal(rows[rows.length - 1].source, "TOTAL");
  // Every source in the report is represented exactly once (order preserved).
  assert.deepEqual(
    rows.slice(0, -1).map((r) => r.source),
    report.rows.map((r) => r.source)
  );
});

test("Referral row carries the 109.38% pass-through divergence, uncapped (§4 rule 8)", () => {
  const referral = findRow("Referral");
  assert.equal(referral.deals, 1);
  // Money passes through verbatim — the honest Σ collected (875,000), not the sheet's 800,000.
  assert.equal(referral.bookedNetGci, "800000.00");
  assert.equal(referral.collectedNet, "875000.00");
  assert.equal(referral.outstandingNet, "0.00");
  assert.equal(referral.resaleRentalNetGci, "800000.00");
  assert.equal(referral.developerNetGci, "0.00");
  // The % Collected column formats the 6-dp ratio to 2-dp percent, above 100%.
  assert.equal(cell(referral, "% Collected"), "109.38%");
  assert.equal(cell(referral, "Collected NET"), "875000.00"); // money → raw string for format.ts
});

test("YouTube row ties to the §9 fixture through the flatten", () => {
  const yt = findRow("YouTube");
  assert.equal(yt.deals, 7);
  assert.equal(yt.bookedNetGci, "2455541.29");
  assert.equal(yt.collectedNet, "397142.86");
  assert.equal(yt.outstandingNet, "2058398.43"); // stored-2dp Σ balance (the shipped figure)
  assert.equal(yt.resaleRentalNetGci, "352500.00");
  assert.equal(yt.developerNetGci, "2103041.29");
  assert.equal(cell(yt, "% Collected"), "16.17%"); // 397142.86 / 2455541.29
  assert.equal(cell(yt, "Avg NET GCI / deal"), "350791.61"); // 2455541.29 / 7
});

test("an active zero-deal source renders zeros and em-dash Avg / % Collected (FR-M7-12)", () => {
  const tiktok = findRow("TikTok");
  assert.equal(tiktok.deals, 0);
  assert.equal(tiktok.bookedNetGci, "0.00");
  assert.equal(tiktok.collectedNet, "0.00");
  assert.equal(tiktok.outstandingNet, "0.00");
  // % of NET GCI is defined (0 ÷ total) → 0.00%; Avg and % Collected are undefined → "—".
  assert.equal(cell(tiktok, "% of NET GCI"), "0.00%");
  assert.equal(cell(tiktok, "Avg NET GCI / deal"), "—");
  assert.equal(cell(tiktok, "% Collected"), "—");
});

test("TOTAL row mirrors report.total: 100.00% of NET GCI, recomputed % Collected", () => {
  const total = rows[rows.length - 1];
  assert.equal(total.deals, report.total.deals);
  assert.equal(total.bookedNetGci, report.total.bookedNetGci);
  assert.equal(total.collectedNet, report.total.collectedNet);
  assert.equal(cell(total, "% of NET GCI"), "100.00%");
  // % Collected recomputed from totals, never averaged: (397142.86 + 875000) / 3255541.29.
  assert.equal(cell(total, "% Collected"), "39.08%");
});
