import { formatPHP, formatRateAsPercent, formatYield } from "@/lib/money";
import type { ExportColumn } from "@/lib/export/format";
import type { Plan } from "./engine";
import { assumptionSourceLabel, funnelRatePercentLabel } from "./display";

/**
 * M3.3 — the pure flattening of a computed {@link Plan} into export rows (FR-M3-12).
 * Kept out of the server-only export registry so it is unit-testable against the §10
 * fixtures directly. Money and counts are the engine's exact 2-dp strings (Rule 7 —
 * full precision was chained inside the engine; these are the display-boundary values,
 * so the download ties to the screen to the centavo). Percents/formulae ride in the
 * text `detail` column. A Yearly/Monthly/Weekly cell is null on scalar lines.
 *
 * The pace lines carry the M3.4 seam: with no YTD aggregate yet, YTD actual and
 * Balance are null and the detail says so — Total Sales required is real today.
 */
export type PlanExportRow = {
  line: string;
  /** Yearly figure (money or a 2-dp count), exact stored string, or null on scalars. */
  yearly: string | null;
  monthly: string | null;
  weekly: string | null;
  /** Formula, source label, or the pace seam note — free text. */
  detail: string | null;
};

export const CALCULATOR_PLAN_COLUMNS: readonly ExportColumn<PlanExportRow>[] = [
  { header: "Line", type: "text", value: (r) => r.line, width: 32 },
  { header: "Yearly", type: "money", value: (r) => r.yearly, width: 18 },
  { header: "Monthly", type: "money", value: (r) => r.monthly, width: 16 },
  { header: "Weekly", type: "money", value: (r) => r.weekly, width: 16 },
  { header: "Detail", type: "text", value: (r) => r.detail ?? "", width: 44 },
];

const scalar = (line: string, yearly: string | null, detail: string): PlanExportRow => ({
  line,
  yearly,
  monthly: null,
  weekly: null,
  detail,
});

export function planToRows(plan: Plan): PlanExportRow[] {
  const { economicModel: em, assumptions: a, goals, pace } = plan;
  const rows: PlanExportRow[] = [];

  // --- economic model (scalars) ----------------------------------------------
  rows.push(
    scalar(
      "Net income %",
      null,
      `${formatRateAsPercent(em.netIncomePct)} = 1 − Opex ${formatRateAsPercent(em.opexEff)}${
        em.opexIsDefault ? " (default)" : ""
      } − CoS ${formatRateAsPercent(em.cosEff)}${em.cosIsDefault ? " (default)" : ""}`
    )
  );
  rows.push(scalar("GCI raw target", em.gciRawTarget, "= Net Income Target ÷ net income %"));
  rows.push({
    line: "Working GCI goal",
    yearly: goals.gci.yearly,
    monthly: goals.gci.monthly,
    weekly: goals.gci.weekly,
    detail: "auto round-up to the nearest ₱10,000",
  });

  // --- assumptions -----------------------------------------------------------
  rows.push(
    scalar(
      "Average sale price",
      null,
      `${formatPHP(a.priceEff)} — ${assumptionSourceLabel(a.priceSource, plan.year)}`
    )
  );
  rows.push(
    scalar(
      "Blended yield",
      null,
      `${formatYield(a.yieldEff)} — ${assumptionSourceLabel(a.yieldSource, plan.year)}`
    )
  );
  rows.push(
    scalar("Professional fees per deal", a.feesPerDeal, "= price × yield (Net of VAT — no ÷1.12)")
  );

  // --- goals -----------------------------------------------------------------
  rows.push({
    line: "Net Income Target",
    yearly: goals.netIncome.yearly,
    monthly: goals.netIncome.monthly,
    weekly: goals.netIncome.weekly,
    detail: "the profit you keep for the year",
  });
  rows.push({
    line: "Listings SOLD (deals)",
    yearly: goals.listingsSold.yearly,
    monthly: goals.listingsSold.monthly,
    weekly: goals.listingsSold.weekly,
    detail: "= GCI goal ÷ fees per deal",
  });
  rows.push({
    line: "Buyer ATP (deals)",
    yearly: goals.buyerAtp.yearly,
    monthly: goals.buyerAtp.monthly,
    weekly: goals.buyerAtp.weekly,
    detail: "= Listings SOLD — both sides of each deal",
  });

  // --- funnels (bottom → top; divide upward) ---------------------------------
  const funnelRows = (label: string, stages: Plan["sellerFunnel"]["stages"]): void => {
    for (const stage of stages) {
      rows.push({
        line: `${label}: ${stage.label}`,
        yearly: stage.counts.yearly,
        monthly: stage.counts.monthly,
        weekly: stage.counts.weekly,
        detail: stage.rate ? `÷ ${funnelRatePercentLabel(stage.rate)}` : "deals to close",
      });
    }
  };
  funnelRows("Seller funnel", plan.sellerFunnel.stages);
  funnelRows("Buyer funnel", plan.buyerFunnel.stages);

  // --- pace (Total Sales real; YTD/Balance are the M3.4 seam) -----------------
  rows.push(scalar("Total Sales required", pace.totalSalesRequired, "= GCI goal ÷ yield"));
  rows.push(
    scalar(
      "YTD actual booked",
      pace.ytdActualSales,
      pace.ytdActualSales === null ? "Live year-to-date pace lands with M3.4" : "booked this plan year"
    )
  );
  rows.push(
    scalar(
      "Balance to target",
      pace.balanceToTarget,
      pace.balanceToTarget === null
        ? "Live year-to-date pace lands with M3.4"
        : "= Total Sales required − YTD actual"
    )
  );

  return rows;
}
