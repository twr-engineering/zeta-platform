import { formatRateAsPercent, formatYield, toMoney } from "@/lib/money";
import type { ExportColumn } from "@/lib/export/format";
import type { PlanningBasis, ReportRowKey, YieldSummaryReport } from "./aggregate";

/**
 * M2.4 — the pure flattening of a Yield Summary report + all-time planning basis into
 * export rows (FR-M2-09). Kept out of the server-only export registry so it is unit-
 * testable against the §9 fixtures directly. Money is the stored 2-dp `::text` string
 * (exact); yields are pre-formatted 4-dp percent strings (§7 — screens show 2 dp but
 * exports carry 4 dp); share of sales is the 2-dp percent the screen shows. A cell is
 * `null` where the line does not use that column.
 *
 * The planning-basis lines are ALWAYS all-time (Rule 4), independent of the report's
 * year filter, and carry the DISPLAY-rounded figures (2-dp price, 4-dp yield) — the
 * full-precision decimals cross to M3 only over the PlanningBasis API, never an export.
 */
export type YieldExportRow = {
  line: string;
  deals: number | null;
  /** Price-like money (volume, avg prices) as a stored 2-dp string, or null. */
  volume: string | null;
  /** GCI-like money (gci, total, memos, rental YTD) as a stored 2-dp string, or null. */
  gci: string | null;
  /** 4-dp yield percent string, or null. */
  realizedYield: string | null;
  /** 2-dp share percent string, or null. */
  shareOfSales: string | null;
};

export const YIELD_SUMMARY_COLUMNS: readonly ExportColumn<YieldExportRow>[] = [
  { header: "Line", type: "text", value: (r) => r.line, width: 40 },
  { header: "Deals", type: "number", value: (r) => r.deals, width: 8 },
  { header: "Volume", type: "money", value: (r) => r.volume, width: 18 },
  { header: "GCI (Net of VAT)", type: "money", value: (r) => r.gci, width: 18 },
  { header: "Realized Yield", type: "text", value: (r) => r.realizedYield ?? "—", width: 16 },
  { header: "Share of Sales", type: "text", value: (r) => r.shareOfSales ?? "—", width: 16 },
];

const YIELD_ROW_LABELS: Record<ReportRowKey, string> = {
  resale: "Resale",
  developer: "Developer",
  sales_subtotal: "SALES SUBTOTAL",
  rental: "Rental (on rent)",
  referral: "Referral (fees)",
};

export function yieldReportToRows(
  report: YieldSummaryReport,
  planning: PlanningBasis
): YieldExportRow[] {
  const rows: YieldExportRow[] = report.rows.map((r) => ({
    line: YIELD_ROW_LABELS[r.key],
    deals: r.deals,
    volume: r.volume,
    gci: r.gci,
    realizedYield: r.realizedYield === null ? null : formatYield(r.realizedYield),
    shareOfSales: r.shareOfSales === null ? null : formatRateAsPercent(r.shareOfSales),
  }));

  const line = (label: string, over: Partial<YieldExportRow>): YieldExportRow => ({
    line: label,
    deals: null,
    volume: null,
    gci: null,
    realizedYield: null,
    shareOfSales: null,
    ...over,
  });

  rows.push(line("TOTAL GCI (ALL OPERATIONS)", { gci: report.totalGciAllOps }));
  rows.push(line("Incentives (+) — memo, already inside the GCI above", { gci: report.memoIncentives }));
  rows.push(line("Referral-outs (−) — memo, already inside the GCI above", { gci: report.memoReferralOuts }));
  rows.push(line("Resale avg price", { volume: report.resaleAvgPrice }));
  rows.push(line("Developer avg price", { volume: report.developerAvgPrice }));
  rows.push(line("BLENDED SALE avg price → feeds calculator", { volume: report.blendedAvgPrice }));
  rows.push(line("Rental annual GCI (YTD)", { gci: report.rentalAnnualGci }));
  rows.push(
    line("PLANNING BASIS — All-time sales (ignores the year filter)", {
      deals: planning.allTimeSalesDeals,
      volume: planning.allTimeSalesVolume,
      gci: planning.allTimeSalesGci,
    })
  );
  rows.push(
    line("PLANNING BASIS — All-time blended yield (AllTimeYield)", {
      realizedYield: planning.allTimeYield === null ? null : formatYield(planning.allTimeYield),
    })
  );
  rows.push(
    line("PLANNING BASIS — All-time blended avg price (AllTimePrice)", {
      volume: planning.allTimePrice === null ? null : toMoney(planning.allTimePrice).toFixed(2),
    })
  );
  return rows;
}
