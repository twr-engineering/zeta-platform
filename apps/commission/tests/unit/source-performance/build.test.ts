import test from "node:test";
import assert from "node:assert/strict";

import {
  collectedNetForSource,
  distinctBookedYears,
  sourcePerformance,
  type SourceLeadSource,
} from "../../../src/lib/source-performance/build.ts";
import type { ProjectionReceivable } from "../../../src/lib/receivables/projections.ts";

/**
 * M7.1 — Source Performance fixture parity. The fixture reproduces the v30.20
 * workbook's 21 receivables (per WORKBOOK_REFERENCE §3 Deal Log + §4 Payments Log +
 * §5 Collectibles verified state), each carrying its real lead source, deal_type,
 * booked NET GCI, Σ collected, balance and status. It asserts the COMPLETE PRD §9
 * criterion-1 table to the centavo, the cross-module ties (§8), and the FR-M7-03 /
 * OQ1 Collected divergence (Referral 875,000, not the sheet's 800,000).
 *
 * All 21 deals are 2026-booked, so Year=2026 must equal Year=All (AC2 — proves the
 * filter compares BOOKING year).
 *
 * ── Precision note: TWO per-source cells are the PRD-rule-9 "visible centavo drift" ──
 * M7 reads the M4 receivable, whose booked_net_gci / collected_net / balance are all
 * `numeric(14,2)` (stored at 2 dp). It sums those stored columns — the M4.4/M6
 * doctrine (Rule 8: sum what M1 persisted) and the ONLY way the TOTAL row ties to
 * M6's Balance Outstanding (§8). The PRD §9 table instead prints the FULL-PRECISION
 * deal figures (net_gci before its 2-dp storage), which differ by a centavo on two
 * cells — exactly the drift PRD §4 rule 9 names ("…44 from full precision; summing
 * the 2-dp per-deal figures gives …43"):
 *   • YouTube Outstanding — stored-2dp Σ balance = 2,058,398.43; full precision .44.
 *   • Lamudi Avg/deal      — stored 863,003.13 ÷ 2 = .565 → .57; full 863,003.125 ÷ 2
 *                            = .5625 → .56 (D010's 426,953.125 stored as .13).
 * The shipped SaaS value — what the live import produces and what ties to M6 — is the
 * stored-2dp figure (.43 / .57). Both per-source drifts cancel at the TOTAL, which is
 * .39 either way. Every OTHER §9 cell matches the PRD table verbatim. Flagged for the
 * owner like OQ5 (.30→.29) and the memo 357,142.87/.86 precedents — no silent resolve.
 */

// --- lead sources (M0 order = WORKBOOK Settings order; all active for the base fixture) ---
const SRC = {
  repeatClient: "src-repeat-client",
  youtube: "src-youtube",
  lamudi: "src-lamudi",
  referral: "src-referral",
  sphere: "src-sphere",
  facebookOrganic: "src-facebook-organic",
  // seven active, zero-deal seed sources (AC1's zero rows)
  openHouse: "src-open-house",
  signCall: "src-sign-call",
  facebookAds: "src-facebook-ads",
  tiktok: "src-tiktok",
  instagram: "src-instagram",
  linkedin: "src-linkedin",
  website: "src-website",
} as const;

const LEAD_SOURCES: SourceLeadSource[] = [
  { id: SRC.repeatClient, name: "Repeat Client", archived_at: null, sort_order: 0 },
  { id: SRC.youtube, name: "YouTube", archived_at: null, sort_order: 1 },
  { id: SRC.lamudi, name: "Lamudi", archived_at: null, sort_order: 2 },
  { id: SRC.referral, name: "Referral", archived_at: null, sort_order: 3 },
  { id: SRC.sphere, name: "Sphere / Personal Network", archived_at: null, sort_order: 4 },
  { id: SRC.facebookOrganic, name: "Facebook Organic", archived_at: null, sort_order: 5 },
  { id: SRC.openHouse, name: "Open House", archived_at: null, sort_order: 6 },
  { id: SRC.signCall, name: "Sign Call / Walk-in", archived_at: null, sort_order: 7 },
  { id: SRC.facebookAds, name: "Facebook Ads", archived_at: null, sort_order: 8 },
  { id: SRC.tiktok, name: "TikTok", archived_at: null, sort_order: 9 },
  { id: SRC.instagram, name: "Instagram", archived_at: null, sort_order: 10 },
  { id: SRC.linkedin, name: "LinkedIn", archived_at: null, sort_order: 11 },
  { id: SRC.website, name: "Website", archived_at: null, sort_order: 12 },
];

/** Build one receivable row; unset money fields default to a zero-balance closed shape. */
function rcv(p: {
  code: string;
  source: string;
  type: "developer" | "resale" | "n_a";
  booked: string;
  collected: string;
  balance: string;
  status: "open" | "closed" | "cancelled";
  year?: number;
  archived_at?: string | null;
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
    booked_year: p.year ?? 2026,
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
    archived_at: p.archived_at ?? null,
    developer: null,
  };
}

// The 21 workbook receivables (booked NET GCI, Σ collected, open balance, status).
const WORKBOOK: ProjectionReceivable[] = [
  // Lamudi — D001 resale (closed, collected 436,050) + D010 developer (open).
  rcv({ code: "D001", source: SRC.lamudi, type: "resale", booked: "436050.00", collected: "436050.00", balance: "0.00", status: "closed" }),
  rcv({ code: "D010", source: SRC.lamudi, type: "developer", booked: "426953.13", collected: "0.00", balance: "426953.13", status: "open" }),
  // Repeat Client — 4 resale open, 1 developer open, 4 rentals closed & collected.
  rcv({ code: "D002", source: SRC.repeatClient, type: "resale", booked: "126500.00", collected: "0.00", balance: "126500.00", status: "open" }),
  rcv({ code: "D003", source: SRC.repeatClient, type: "resale", booked: "117500.00", collected: "0.00", balance: "117500.00", status: "open" }),
  rcv({ code: "D005", source: SRC.repeatClient, type: "resale", booked: "675000.00", collected: "0.00", balance: "675000.00", status: "open" }),
  rcv({ code: "D007", source: SRC.repeatClient, type: "resale", booked: "180000.00", collected: "0.00", balance: "180000.00", status: "open" }),
  rcv({ code: "D008", source: SRC.repeatClient, type: "developer", booked: "317414.70", collected: "0.00", balance: "317414.70", status: "open" }),
  rcv({ code: "D017", source: SRC.repeatClient, type: "n_a", booked: "22500.00", collected: "22500.00", balance: "0.00", status: "closed" }),
  rcv({ code: "D018", source: SRC.repeatClient, type: "n_a", booked: "130000.00", collected: "130000.00", balance: "0.00", status: "closed" }),
  rcv({ code: "D019", source: SRC.repeatClient, type: "n_a", booked: "10000.00", collected: "10000.00", balance: "0.00", status: "closed" }),
  rcv({ code: "D020", source: SRC.repeatClient, type: "n_a", booked: "37500.00", collected: "37500.00", balance: "0.00", status: "closed" }),
  // Referral — D004 resale, override: booked 800,000, collected 875,000 (pass-through), closed.
  rcv({ code: "D004", source: SRC.referral, type: "resale", booked: "800000.00", collected: "875000.00", balance: "0.00", status: "closed" }),
  // YouTube — D006 resale (closed, collected) + 6 developer (D021 partial incentive release).
  rcv({ code: "D006", source: SRC.youtube, type: "resale", booked: "352500.00", collected: "352500.00", balance: "0.00", status: "closed" }),
  rcv({ code: "D011", source: SRC.youtube, type: "developer", booked: "155803.57", collected: "0.00", balance: "155803.57", status: "open" }),
  rcv({ code: "D012", source: SRC.youtube, type: "developer", booked: "206696.43", collected: "0.00", balance: "206696.43", status: "open" }),
  rcv({ code: "D013", source: SRC.youtube, type: "developer", booked: "906752.23", collected: "0.00", balance: "906752.23", status: "open" }),
  rcv({ code: "D014", source: SRC.youtube, type: "developer", booked: "401965.08", collected: "0.00", balance: "401965.08", status: "open" }),
  rcv({ code: "D015", source: SRC.youtube, type: "developer", booked: "77232.14", collected: "0.00", balance: "77232.14", status: "open" }),
  rcv({ code: "D021", source: SRC.youtube, type: "developer", booked: "354591.84", collected: "44642.86", balance: "309948.98", status: "open" }),
  // Sphere / Personal Network — D016 developer, open, nothing collected.
  rcv({ code: "D016", source: SRC.sphere, type: "developer", booked: "630813.93", collected: "0.00", balance: "630813.93", status: "open" }),
  // Facebook Organic — D009 developer, open, nothing collected.
  rcv({ code: "D009", source: SRC.facebookOrganic, type: "developer", booked: "322724.20", collected: "0.00", balance: "322724.20", status: "open" }),
];

// Cross-module tie anchors (PRD §8 / Milestones DoD).
const TOTAL_BOOKED = "6688497.25"; // = M2 all-operations GCI
const TOTAL_COLLECTED = "1908192.86"; // = M6 "Total Collected Net"
const TOTAL_OUTSTANDING = "4855304.39"; // = M6 "Balance Outstanding"

function bySource(report: ReturnType<typeof sourcePerformance>) {
  const map = new Map(report.rows.map((r) => [r.leadSourceId, r]));
  return (id: string) => {
    const r = map.get(id);
    assert.ok(r, `expected a row for source ${id}`);
    return r;
  };
}

test("M7.1 — the complete PRD §9 criterion-1 table, to the centavo (Year = All)", () => {
  const report = sourcePerformance(WORKBOOK, LEAD_SOURCES, "all");
  const get = bySource(report);

  // Row-1 identity for every source: Booked = Resale+Rental GCI + Developer GCI.
  for (const r of report.rows) {
    assert.equal(
      r.resaleRentalNetGci,
      // developer = booked − R+R, at centavo scale
      (Number(r.bookedNetGci) - Number(r.developerNetGci)).toFixed(2),
      `${r.source}: Booked = R+R + Developer`
    );
  }

  // --- YouTube (§3.3 worked row) --------------------------------------------
  const yt = get(SRC.youtube);
  assert.equal(yt.source, "YouTube");
  assert.equal(yt.deals, 7);
  assert.equal(yt.bookedNetGci, "2455541.29");
  assert.equal(yt.pctOfNetGci, "0.367129"); // 36.71%
  assert.equal(yt.avgNetGciPerDeal, "350791.61");
  assert.equal(yt.collectedNet, "397142.86");
  assert.equal(yt.pctCollected, "0.161733"); // 16.17%
  assert.equal(yt.outstandingNet, "2058398.43"); // stored-2dp Σ balance (PRD table prints full-precision .44)
  assert.equal(yt.resaleRentalNetGci, "352500.00");
  assert.equal(yt.resaleRentalOutstanding, "0.00");
  assert.equal(yt.developerNetGci, "2103041.29");

  // --- Repeat Client (§3.4 walk-through: resale + rental + developer) -------
  const rc = get(SRC.repeatClient);
  assert.equal(rc.deals, 9);
  assert.equal(rc.bookedNetGci, "1616414.70");
  assert.equal(rc.pctOfNetGci, "0.241671"); // 24.17%
  assert.equal(rc.avgNetGciPerDeal, "179601.63");
  assert.equal(rc.collectedNet, "200000.00");
  assert.equal(rc.pctCollected, "0.123731"); // 12.37%
  assert.equal(rc.outstandingNet, "1416414.70");
  assert.equal(rc.resaleRentalNetGci, "1299000.00");
  assert.equal(rc.resaleRentalOutstanding, "1099000.00");
  assert.equal(rc.developerNetGci, "317414.70");

  // --- Lamudi (2 deals; the one round-half-up divergence is Avg) ------------
  const lam = get(SRC.lamudi);
  assert.equal(lam.deals, 2);
  assert.equal(lam.bookedNetGci, "863003.13");
  assert.equal(lam.pctOfNetGci, "0.129028"); // 12.90%
  assert.equal(lam.avgNetGciPerDeal, "431501.57"); // stored 863,003.13÷2 (PRD table prints full-precision .56)
  assert.equal(lam.collectedNet, "436050.00");
  assert.equal(lam.pctCollected, "0.505270"); // 50.53%
  assert.equal(lam.outstandingNet, "426953.13");
  assert.equal(lam.resaleRentalNetGci, "436050.00");
  assert.equal(lam.resaleRentalOutstanding, "0.00");
  assert.equal(lam.developerNetGci, "426953.13");

  // --- Referral (FR-M7-03 / OQ1 divergence: 875,000, NOT the sheet's 800,000) ---
  const ref = get(SRC.referral);
  assert.equal(ref.deals, 1);
  assert.equal(ref.bookedNetGci, "800000.00");
  assert.equal(ref.pctOfNetGci, "0.119608"); // 11.96%
  assert.equal(ref.avgNetGciPerDeal, "800000.00");
  assert.equal(ref.collectedNet, "875000.00"); // Σ collected, the honest figure
  assert.equal(ref.pctCollected, "1.093750"); // 109.38% — NOT capped
  assert.equal(ref.outstandingNet, "0.00");
  assert.equal(ref.resaleRentalNetGci, "800000.00");
  assert.equal(ref.resaleRentalOutstanding, "0.00");
  assert.equal(ref.developerNetGci, "0.00");

  // --- Sphere / Personal Network --------------------------------------------
  const sph = get(SRC.sphere);
  assert.equal(sph.deals, 1);
  assert.equal(sph.bookedNetGci, "630813.93");
  assert.equal(sph.pctOfNetGci, "0.094313"); // 9.43%
  assert.equal(sph.avgNetGciPerDeal, "630813.93");
  assert.equal(sph.collectedNet, "0.00");
  assert.equal(sph.pctCollected, "0.000000"); // 0.00%
  assert.equal(sph.outstandingNet, "630813.93");
  assert.equal(sph.developerNetGci, "630813.93");
  assert.equal(sph.resaleRentalNetGci, "0.00");

  // --- Facebook Organic -----------------------------------------------------
  const fb = get(SRC.facebookOrganic);
  assert.equal(fb.deals, 1);
  assert.equal(fb.bookedNetGci, "322724.20");
  assert.equal(fb.pctOfNetGci, "0.048251"); // 4.83%
  assert.equal(fb.avgNetGciPerDeal, "322724.20");
  assert.equal(fb.collectedNet, "0.00");
  assert.equal(fb.outstandingNet, "322724.20");
  assert.equal(fb.developerNetGci, "322724.20");

  // --- TOTAL row (§3.5) ------------------------------------------------------
  const t = report.total;
  assert.equal(t.deals, 21);
  assert.equal(t.bookedNetGci, TOTAL_BOOKED);
  assert.equal(t.pctOfNetGci, "1.000000"); // 100.00% by construction
  assert.equal(t.avgNetGciPerDeal, "318499.87"); // recomputed 6,688,497.25 ÷ 21
  assert.equal(t.collectedNet, TOTAL_COLLECTED);
  assert.equal(t.pctCollected, "0.285295"); // 28.53% from totals (NOT averaged rows)
  assert.equal(t.outstandingNet, TOTAL_OUTSTANDING);
  assert.equal(t.resaleRentalNetGci, "2887550.00");
  assert.equal(t.resaleRentalOutstanding, "1099000.00");
  assert.equal(t.developerNetGci, "3800947.25");
});

test("M7.1 — visibility: six sources with deals + seven active zero rows; TOTAL pinned separately", () => {
  const report = sourcePerformance(WORKBOOK, LEAD_SOURCES, "all");
  // 6 sources have deals; 7 active seed sources are zero rows → 13 rows, no TOTAL inside.
  assert.equal(report.rows.length, 13);
  const zeroRows = report.rows.filter((r) => r.deals === 0);
  assert.equal(zeroRows.length, 7);
  for (const z of zeroRows) {
    assert.equal(z.bookedNetGci, "0.00");
    assert.equal(z.collectedNet, "0.00");
    assert.equal(z.outstandingNet, "0.00");
    assert.equal(z.pctOfNetGci, "0.000000"); // 0 ÷ 6,688,497.25
    assert.equal(z.avgNetGciPerDeal, null); // 0 deals → no average
    assert.equal(z.pctCollected, null); // 0 booked → no ratio
    assert.equal(z.resaleRentalNetGci, "0.00");
    assert.equal(z.developerNetGci, "0.00");
  }
});

test("M7.1 — default ordering is Booked NET GCI descending (§4 rule 10)", () => {
  const report = sourcePerformance(WORKBOOK, LEAD_SOURCES, "all");
  const nonZero = report.rows.filter((r) => r.deals > 0).map((r) => r.source);
  assert.deepEqual(nonZero, [
    "YouTube",
    "Repeat Client",
    "Lamudi",
    "Referral",
    "Sphere / Personal Network",
    "Facebook Organic",
  ]);
  // The seven zero rows sink to the bottom, in lead-source list order.
  const tail = report.rows.slice(6).map((r) => r.source);
  assert.deepEqual(tail, [
    "Open House",
    "Sign Call / Walk-in",
    "Facebook Ads",
    "TikTok",
    "Instagram",
    "LinkedIn",
    "Website",
  ]);
});

test("M7.1 — AC2: Year = 2026 equals Year = All (filter compares BOOKING year)", () => {
  const all = sourcePerformance(WORKBOOK, LEAD_SOURCES, "all");
  const y2026 = sourcePerformance(WORKBOOK, LEAD_SOURCES, 2026);
  assert.deepEqual(y2026.rows, all.rows);
  assert.deepEqual(y2026.total, all.total);
  assert.equal(y2026.year, 2026);
});

test("M7.1 — cross-module ties: Σ Booked / Collected / Outstanding over rows = TOTAL = §8 anchors", () => {
  const report = sourcePerformance(WORKBOOK, LEAD_SOURCES, "all");
  const sumCol = (get: (r: (typeof report.rows)[number]) => string) =>
    report.rows
      .reduce((acc, r) => acc + Number(get(r)), 0)
      .toFixed(2);

  assert.equal(sumCol((r) => r.bookedNetGci), TOTAL_BOOKED);
  assert.equal(sumCol((r) => r.collectedNet), TOTAL_COLLECTED);
  assert.equal(sumCol((r) => r.outstandingNet), TOTAL_OUTSTANDING);

  assert.equal(report.total.bookedNetGci, TOTAL_BOOKED);
  assert.equal(report.total.collectedNet, TOTAL_COLLECTED);
  assert.equal(report.total.outstandingNet, TOTAL_OUTSTANDING);

  // Grand total ties out (§9 note): 6,688,497.25 = 6,488,497.25 sales + 200,000 rentals.
  const rentals = WORKBOOK.filter((r) => r.deal_type === "n_a").reduce(
    (a, r) => a + Number(r.booked_net_gci),
    0
  );
  assert.equal(rentals.toFixed(2), "200000.00");
});

test("M7.1 — AC3: the Referral row is the OQ1 divergence anchor (spec Σ collected ≠ sheet Booked − Outstanding)", () => {
  const report = sourcePerformance(WORKBOOK, LEAD_SOURCES, "all");
  const ref = report.rows.find((r) => r.leadSourceId === SRC.referral)!;
  // Spec default (shipped):
  assert.equal(ref.collectedNet, "875000.00");
  assert.equal(ref.pctCollected, "1.093750");
  // The sheet's derivation (Booked − Outstanding) would give the WRONG figure:
  const sheetDerived = (Number(ref.bookedNetGci) - Number(ref.outstandingNet)).toFixed(2);
  assert.equal(sheetDerived, "800000.00");
  assert.notEqual(ref.collectedNet, sheetDerived);
});

test("M7.1 — archived-with-deals reports as '(inactive)'; archived-with-zero is hidden (§4 rule 3)", () => {
  // Archive Lamudi (has 2 deals) and TikTok (0 deals).
  const sources = LEAD_SOURCES.map((s) =>
    s.id === SRC.lamudi || s.id === SRC.tiktok
      ? { ...s, archived_at: "2026-07-01T00:00:00Z" }
      : s
  );
  const report = sourcePerformance(WORKBOOK, sources, "all");

  const lam = report.rows.find((r) => r.leadSourceId === SRC.lamudi)!;
  assert.equal(lam.source, "Lamudi (inactive)");
  assert.equal(lam.archived, true);
  assert.equal(lam.deals, 2); // figures unchanged
  assert.equal(lam.bookedNetGci, "863003.13");

  // TikTok (0 deals, archived) disappears; the other 6 active zero rows remain.
  assert.equal(report.rows.some((r) => r.leadSourceId === SRC.tiktok), false);
  assert.equal(report.rows.length, 12);
});

test("M7.1 — never-orphan: a referenced source missing from the master list still reports", () => {
  // Drop YouTube from the master list; its 7 deals must not vanish (edge case 18).
  const sources = LEAD_SOURCES.filter((s) => s.id !== SRC.youtube);
  const report = sourcePerformance(WORKBOOK, sources, "all");
  const orphan = report.rows.find((r) => r.leadSourceId === SRC.youtube);
  assert.ok(orphan, "orphaned source must still report");
  assert.equal(orphan!.deals, 7);
  assert.equal(orphan!.bookedNetGci, "2455541.29");
  // The report's Booked still ties — no NET GCI dropped out.
  assert.equal(report.total.bookedNetGci, TOTAL_BOOKED);
});

test("M7.1 — FR-M7-06 (edge case 19): a booked-but-uncollected year renders 0%-collected rows, not empty", () => {
  const synthetic = [
    rcv({ code: "D999", source: SRC.youtube, type: "developer", booked: "500000.00", collected: "0.00", balance: "500000.00", status: "open", year: 2027 }),
  ];
  const report = sourcePerformance([...WORKBOOK, ...synthetic], LEAD_SOURCES, 2027);
  const yt = report.rows.find((r) => r.leadSourceId === SRC.youtube)!;
  assert.equal(yt.deals, 1);
  assert.equal(yt.bookedNetGci, "500000.00");
  assert.equal(yt.collectedNet, "0.00");
  assert.equal(yt.pctCollected, "0.000000"); // 0.00%, not null, not empty
  assert.equal(yt.outstandingNet, "500000.00");
  // Year=All TOTAL Booked rises by exactly 500,000 (AC6).
  const all = sourcePerformance([...WORKBOOK, ...synthetic], LEAD_SOURCES, "all");
  assert.equal(all.total.bookedNetGci, "7188497.25");
  assert.equal((Number(all.total.bookedNetGci) - Number(TOTAL_BOOKED)).toFixed(2), "500000.00");
});

test("M7.1 — AC7: a Cancelled-with-partial-collection row counts Booked +, Collected = actual cash, Outstanding +0", () => {
  const cancelled = rcv({
    code: "DX01",
    source: SRC.website,
    type: "developer",
    booked: "500000.00",
    collected: "100000.00",
    balance: "0.00", // written off
    status: "cancelled",
  });
  const report = sourcePerformance([...WORKBOOK, cancelled], LEAD_SOURCES, "all");
  const web = report.rows.find((r) => r.leadSourceId === SRC.website)!;
  assert.equal(web.deals, 1);
  assert.equal(web.bookedNetGci, "500000.00"); // Booked +500,000 (sheet parity, §4 rule 5)
  assert.equal(web.collectedNet, "100000.00"); // actual cash, not full
  assert.equal(web.outstandingNet, "0.00"); // written off
  // Documents the sheet-derivation divergence: Booked − Outstanding would claim 500,000.
  assert.notEqual(web.collectedNet, (Number(web.bookedNetGci) - Number(web.outstandingNet)).toFixed(2));
});

test("M7.1 — distinctBookedYears lists only years with booked deals, newest first (FR-M7-02 / AC8)", () => {
  assert.deepEqual(distinctBookedYears(WORKBOOK), [2026]);
  const with2027 = [
    ...WORKBOOK,
    rcv({ code: "D999", source: SRC.youtube, type: "developer", booked: "500000.00", collected: "0.00", balance: "500000.00", status: "open", year: 2027 }),
  ];
  assert.deepEqual(distinctBookedYears(with2027), [2027, 2026]);
});

test("M7.1 — collectedNetForSource is the isolated FR-M7-03 Σ collected_net", () => {
  const ytRows = WORKBOOK.filter((r) => r.lead_source_id === SRC.youtube);
  assert.equal(collectedNetForSource(ytRows), "397142.86");
  assert.equal(collectedNetForSource([]), "0.00");
});
