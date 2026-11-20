import { formatRateAsPercent } from "@/lib/money";
import type { ExportColumn } from "@/lib/export/format";
import type {
  SourceMetrics,
  SourcePerformanceReport,
} from "./build";

/**
 * M7.2 — the pure flattening of a Source Performance report (rows + the TOTAL) into
 * export rows (FR-M7-08). Kept out of the server-only export registry so it is unit-
 * testable against the §9 fixtures directly, and so the download ties to the on-screen
 * table to the centavo (AC9): both the screen and this flatten read the ONE
 * `SourcePerformanceReport` the M7.1 service returns — neither computes money.
 *
 * Money is the aggregator's stored 2-dp `::text` string (exact — the same figure the
 * table renders). Percentages are the 6-dp rate strings formatted to the on-screen
 * 2-dp percent (`0.00%`); a `null` ratio (a zero-deal Avg or a zero-Booked %Collected)
 * renders the em-dash the table shows, never a blank or a division error. The TOTAL
 * row is appended last, mirroring the pinned TOTAL on screen.
 *
 * The eleven columns are exactly the screen's (PRD §3.3). Developer Outstanding stays
 * off both surfaces (§3.3 / §10 — implied = Outstanding − R+R Outstanding, sheet parity).
 */
export type SourceExportRow = {
  /** col 1 — the source label ("YouTube", "Lamudi (inactive)", or "TOTAL"). */
  source: string;
  /** col 2 — deal count. */
  deals: number;
  /** col 3 — Booked NET GCI, 2-dp string. */
  bookedNetGci: string;
  /** col 4 — % of NET GCI, 6-dp rate or null (formatted 0.00% / "—"). */
  pctOfNetGci: string | null;
  /** col 5 — Avg NET GCI / deal, 2-dp string or null ("—" on a zero-deal row). */
  avgNetGciPerDeal: string | null;
  /** col 6 — Collected NET, 2-dp string. */
  collectedNet: string;
  /** col 7 — % Collected, 6-dp rate or null (may exceed 100%; "—" when Booked = 0). */
  pctCollected: string | null;
  /** col 8 — Outstanding NET, 2-dp string. */
  outstandingNet: string;
  /** col 9 — Resale + Rental NET GCI, 2-dp string. */
  resaleRentalNetGci: string;
  /** col 10 — Resale + Rental Outstanding, 2-dp string. */
  resaleRentalOutstanding: string;
  /** col 11 — Developer / Pre-selling NET GCI, 2-dp string. */
  developerNetGci: string;
};

/** A ratio → on-screen 2-dp percent, or the em-dash the table renders for a null. */
function pct(rate: string | null): string {
  return rate === null ? "—" : formatRateAsPercent(rate);
}

export const SOURCE_PERFORMANCE_COLUMNS: readonly ExportColumn<SourceExportRow>[] = [
  { header: "Source", type: "text", value: (r) => r.source, width: 28 },
  { header: "Deals", type: "number", value: (r) => r.deals, width: 8 },
  { header: "Booked NET GCI", type: "money", value: (r) => r.bookedNetGci, width: 18 },
  { header: "% of NET GCI", type: "text", value: (r) => pct(r.pctOfNetGci), width: 14 },
  {
    header: "Avg NET GCI / deal",
    type: "text",
    // Avg is money, but a zero-deal row has no average — write the em-dash, not ₱0.00.
    value: (r) => (r.avgNetGciPerDeal === null ? "—" : r.avgNetGciPerDeal),
    width: 18,
  },
  { header: "Collected NET", type: "money", value: (r) => r.collectedNet, width: 18 },
  { header: "% Collected", type: "text", value: (r) => pct(r.pctCollected), width: 14 },
  { header: "Outstanding NET", type: "money", value: (r) => r.outstandingNet, width: 18 },
  { header: "Resale + Rental NET GCI", type: "money", value: (r) => r.resaleRentalNetGci, width: 22 },
  { header: "Resale + Rental Outstanding", type: "money", value: (r) => r.resaleRentalOutstanding, width: 24 },
  { header: "Developer / Pre-selling NET GCI", type: "money", value: (r) => r.developerNetGci, width: 26 },
];

/** Shared shape between a source row and the TOTAL — both flatten identically. */
function toExportRow(source: string, m: SourceMetrics): SourceExportRow {
  return {
    source,
    deals: m.deals,
    bookedNetGci: m.bookedNetGci,
    pctOfNetGci: m.pctOfNetGci,
    avgNetGciPerDeal: m.avgNetGciPerDeal,
    collectedNet: m.collectedNet,
    pctCollected: m.pctCollected,
    outstandingNet: m.outstandingNet,
    resaleRentalNetGci: m.resaleRentalNetGci,
    resaleRentalOutstanding: m.resaleRentalOutstanding,
    developerNetGci: m.developerNetGci,
  };
}

/**
 * The report → export rows: one row per visible source in the report's order (Booked
 * NET GCI descending, §4 rule 10), then the pinned TOTAL row last (§3.5). Nothing is
 * recomputed — every figure is the M7.1 aggregator's, so the CSV/XLSX ties to the
 * screen to the centavo under whatever year filter produced `report` (FR-M7-08 / AC9).
 */
export function sourcePerformanceToRows(
  report: SourcePerformanceReport
): SourceExportRow[] {
  const rows = report.rows.map((r) => toExportRow(r.source, r));
  rows.push(toExportRow("TOTAL", report.total));
  return rows;
}
