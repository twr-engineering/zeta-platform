import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  sourcePerformance,
  type SourceLeadSource,
} from "../../../src/lib/source-performance/build.ts";
import type { ProjectionReceivable } from "../../../src/lib/receivables/projections.ts";

/**
 * M7.3 — source-lifecycle & cross-year edge hardening (pure layer). Where
 * build.test.ts pins the v30.20 §9 table to the centavo, this file pins the LAWS
 * that must hold as Settings and the ledger evolve underneath the report:
 *   • EC18 — a rename propagates to the row LABEL on the next read (the FK is the
 *     identity, the name is never stored on the receivable) and an archive only
 *     changes the label/badge, never a figure; a random archive/rename sequence
 *     never drops a deal's NET GCI (sum-preservation property).
 *   • EC19 — the YEAR FILTER IS A BOOKED LENS: a deal booked in 2025 and collected
 *     in 2026 appears in the 2025 lens WITH its collected cash, and is ABSENT from
 *     the 2026 lens — the payment year moves nothing between buckets (§4 rule 1).
 *   • Cancelled-with-partial — the source row keeps the REAL cash collected while
 *     Outstanding excludes the written-off balance, so % Collected stays honest and
 *     diverges from the sheet's `Booked − Outstanding` derivation (§4 rule 7).
 *
 * All pure over ProjectionReceivable[] + the M0 lead-source list — no DB, no clock.
 */

// --- compact, purpose-built fixture (lifecycle semantics need no full workbook) ---
const SRC = {
  youtube: "src-youtube",
  referral: "src-referral",
  tiktok: "src-tiktok", // active, zero-deal
} as const;

function leadSources(overrides: Partial<Record<string, Partial<SourceLeadSource>>> = {}): SourceLeadSource[] {
  const base: SourceLeadSource[] = [
    { id: SRC.youtube, name: "YouTube", archived_at: null, sort_order: 0 },
    { id: SRC.referral, name: "Referral", archived_at: null, sort_order: 1 },
    { id: SRC.tiktok, name: "TikTok", archived_at: null, sort_order: 2 },
  ];
  return base.map((s) => ({ ...s, ...(overrides[s.id] ?? {}) }));
}

function rcv(p: {
  code: string;
  source: string;
  type: "developer" | "resale" | "n_a";
  booked: string;
  collected: string;
  balance: string;
  status: "open" | "closed" | "cancelled";
  year?: number;
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
    archived_at: null,
    developer: null,
  };
}

// --- EC18: rename propagates to the label, archive only re-labels ------------

test("M7.3 — EC18: a rename propagates to the row label on the next read (same FK, same figures)", () => {
  const receivables = [
    rcv({ code: "D006", source: SRC.youtube, type: "resale", booked: "352500.00", collected: "352500.00", balance: "0.00", status: "closed" }),
    rcv({ code: "D011", source: SRC.youtube, type: "developer", booked: "155803.57", collected: "0.00", balance: "155803.57", status: "open" }),
  ];

  const before = sourcePerformance(receivables, leadSources(), "all");
  const yt = before.rows.find((r) => r.leadSourceId === SRC.youtube)!;
  assert.equal(yt.source, "YouTube");
  assert.equal(yt.deals, 2);
  assert.equal(yt.bookedNetGci, "508303.57");

  // Rename YouTube → "YouTube Organic" in M0; the report re-reads the master list.
  const after = sourcePerformance(
    receivables,
    leadSources({ [SRC.youtube]: { name: "YouTube Organic" } }),
    "all"
  );
  const yt2 = after.rows.find((r) => r.leadSourceId === SRC.youtube)!;
  assert.equal(yt2.source, "YouTube Organic"); // label follows the current name
  assert.equal(yt2.deals, 2); // one continuous row — no orphan, no leftover "YouTube"
  assert.equal(yt2.bookedNetGci, "508303.57");
  assert.equal(after.rows.filter((r) => r.leadSourceId === SRC.youtube).length, 1);
  assert.equal(after.rows.some((r) => r.source === "YouTube"), false);
});

test("M7.3 — EC18: archive re-labels '(inactive)' with figures unchanged; restore reverts", () => {
  const receivables = [
    rcv({ code: "D006", source: SRC.youtube, type: "resale", booked: "352500.00", collected: "352500.00", balance: "0.00", status: "closed" }),
  ];
  const active = sourcePerformance(receivables, leadSources(), "all");
  const bookedActive = active.rows.find((r) => r.leadSourceId === SRC.youtube)!.bookedNetGci;

  const archived = sourcePerformance(
    receivables,
    leadSources({ [SRC.youtube]: { archived_at: "2026-07-01T00:00:00Z" } }),
    "all"
  );
  const yt = archived.rows.find((r) => r.leadSourceId === SRC.youtube)!;
  assert.equal(yt.source, "YouTube (inactive)");
  assert.equal(yt.archived, true);
  assert.equal(yt.bookedNetGci, bookedActive); // figure untouched by the archive

  // Restore → back to the bare label, still one row.
  const restored = sourcePerformance(receivables, leadSources(), "all");
  assert.equal(restored.rows.find((r) => r.leadSourceId === SRC.youtube)!.source, "YouTube");
  assert.equal(restored.rows.find((r) => r.leadSourceId === SRC.youtube)!.archived, false);
});

test("M7.3 — EC18: no rename/archive sequence ever drops a deal's NET GCI (sum-preservation)", () => {
  const receivables = [
    rcv({ code: "D006", source: SRC.youtube, type: "resale", booked: "352500.00", collected: "352500.00", balance: "0.00", status: "closed" }),
    rcv({ code: "D011", source: SRC.youtube, type: "developer", booked: "155803.57", collected: "0.00", balance: "155803.57", status: "open" }),
    rcv({ code: "D004", source: SRC.referral, type: "resale", booked: "800000.00", collected: "875000.00", balance: "0.00", status: "closed" }),
  ];
  // The invariant total, computed once over the raw receivables.
  const expectedBooked = "1308303.57"; // 352500 + 155803.57 + 800000

  fc.assert(
    fc.property(
      // A random rename + archive decision per source, plus dropping a source from
      // the master list entirely (never-orphan: an archived source is never deleted
      // in M0, but the report must survive it either way — edge case 18).
      fc.record({
        ytName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        refName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        ytArchived: fc.boolean(),
        refArchived: fc.boolean(),
        dropYoutube: fc.boolean(),
        dropReferral: fc.boolean(),
      }),
      (m) => {
        let sources = leadSources({
          [SRC.youtube]: { name: m.ytName, archived_at: m.ytArchived ? "2026-01-01T00:00:00Z" : null },
          [SRC.referral]: { name: m.refName, archived_at: m.refArchived ? "2026-01-01T00:00:00Z" : null },
        });
        if (m.dropYoutube) sources = sources.filter((s) => s.id !== SRC.youtube);
        if (m.dropReferral) sources = sources.filter((s) => s.id !== SRC.referral);

        const report = sourcePerformance(receivables, sources, "all");
        // TOTAL booked is invariant under any relabel/archive/drop.
        assert.equal(report.total.bookedNetGci, expectedBooked);
        assert.equal(report.total.deals, 3);
        // Every in-scope receivable is attributed to exactly one row (Σ rows = TOTAL).
        const sumRows = report.rows
          .reduce((acc, r) => acc + Number(r.bookedNetGci), 0)
          .toFixed(2);
        assert.equal(sumRows, expectedBooked);
        const sumDeals = report.rows.reduce((acc, r) => acc + r.deals, 0);
        assert.equal(sumDeals, 3);
      }
    ),
    { numRuns: 200 }
  );
});

// --- EC19: the year filter is a BOOKED lens ----------------------------------

test("M7.3 — EC19: a 2025-booked deal collected in 2026 shows in the 2025 lens with its cash, absent from 2026", () => {
  // D100 booked 2025, cash arrived later (2026): collected_net is cumulative and
  // carries no payment-year — the receivable lives in the booked-2025 bucket.
  const receivables = [
    rcv({ code: "D100", source: SRC.youtube, type: "developer", booked: "500000.00", collected: "120000.00", balance: "380000.00", status: "open", year: 2025 }),
    // A genuinely 2026-booked deal on the same source, so 2026 is a real bucket.
    rcv({ code: "D200", source: SRC.youtube, type: "developer", booked: "300000.00", collected: "0.00", balance: "300000.00", status: "open", year: 2026 }),
  ];

  // 2025 lens: the booked-2025 deal appears WITH its collected cash.
  const y2025 = sourcePerformance(receivables, leadSources(), 2025);
  const yt25 = y2025.rows.find((r) => r.leadSourceId === SRC.youtube)!;
  assert.equal(yt25.deals, 1);
  assert.equal(yt25.bookedNetGci, "500000.00");
  assert.equal(yt25.collectedNet, "120000.00"); // the cash that arrived in 2026 stays in the 2025 row
  assert.equal(yt25.outstandingNet, "380000.00");
  assert.equal(yt25.pctCollected, "0.240000"); // 24.00%, honest

  // 2026 lens: ONLY the 2026-booked deal — the 2025 deal's cash does NOT leak in.
  const y2026 = sourcePerformance(receivables, leadSources(), 2026);
  const yt26 = y2026.rows.find((r) => r.leadSourceId === SRC.youtube)!;
  assert.equal(yt26.deals, 1);
  assert.equal(yt26.bookedNetGci, "300000.00");
  assert.equal(yt26.collectedNet, "0.00"); // NOT 120,000 — booking year is the only key
  assert.equal(yt26.pctCollected, "0.000000");

  // All lens: both deals, cash summed once.
  const all = sourcePerformance(receivables, leadSources(), "all");
  const ytAll = all.rows.find((r) => r.leadSourceId === SRC.youtube)!;
  assert.equal(ytAll.deals, 2);
  assert.equal(ytAll.bookedNetGci, "800000.00");
  assert.equal(ytAll.collectedNet, "120000.00");
});

// --- cancelled-with-partial: honest cash, written-off balance excluded -------

test("M7.3 — cancelled-with-partial: source row keeps the real cash; Outstanding excludes the write-off; % Collected honest", () => {
  // A deal booked 500,000 with 100,000 collected, then cancelled → balance written
  // off to 0. The sheet's `Booked − Outstanding` derivation would claim 500,000
  // collected; the spec keeps the honest ₱100,000 (§4 rule 7).
  const receivables = [
    rcv({ code: "DX01", source: SRC.youtube, type: "developer", booked: "500000.00", collected: "100000.00", balance: "0.00", status: "cancelled" }),
  ];
  const report = sourcePerformance(receivables, leadSources(), "all");
  const yt = report.rows.find((r) => r.leadSourceId === SRC.youtube)!;

  assert.equal(yt.deals, 1);
  assert.equal(yt.bookedNetGci, "500000.00"); // cancelled deal still counts in Booked (§4 rule 5)
  assert.equal(yt.collectedNet, "100000.00"); // the REAL cash — not the full booked
  assert.equal(yt.outstandingNet, "0.00"); // written-off balance excluded (cancelled ⇒ 0)
  assert.equal(yt.pctCollected, "0.200000"); // 20.00% — honest, not the sheet's 100%

  // The divergence, made explicit: the sheet's Booked − Outstanding would over-claim.
  const sheetDerived = (Number(yt.bookedNetGci) - Number(yt.outstandingNet)).toFixed(2);
  assert.equal(sheetDerived, "500000.00");
  assert.notEqual(yt.collectedNet, sheetDerived);

  // TOTAL agrees (single-row report): Collected 100,000, Outstanding 0.
  assert.equal(report.total.collectedNet, "100000.00");
  assert.equal(report.total.outstandingNet, "0.00");
});
