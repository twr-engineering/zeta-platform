import { StatTile } from "@/components/dashboard/stat-tile";
import { formatPHP } from "@/lib/money";
import type { YieldSummaryReport } from "@/lib/yield";

/**
 * M2.4 — the average-price block (PRD §6): Resale avg · Developer avg · BLENDED SALE
 * avg price (marked "→ feeds calculator") · Rental annual GCI (YTD). Empty populations
 * render "—" (muted), never a division error (Rule 5). All values are the server
 * reducer's — the tile never computes money.
 */

function moneyOrDash(value: string | null): { value: string; tone: "default" | "muted" } {
  return value === null ? { value: "—", tone: "muted" } : { value: formatPHP(value), tone: "default" };
}

export function AvgPriceBlock({ report }: { report: YieldSummaryReport }) {
  const resale = moneyOrDash(report.resaleAvgPrice);
  const developer = moneyOrDash(report.developerAvgPrice);
  const blended = moneyOrDash(report.blendedAvgPrice);

  return (
    <section className="space-y-3" data-testid="avg-price-block">
      <h2 className="font-heading text-lg font-semibold tracking-tight">Average price</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Resale avg" value={resale.value} tone={resale.tone} testId="avg-resale" />
        <StatTile
          label="Developer avg"
          value={developer.value}
          tone={developer.tone}
          testId="avg-developer"
        />
        <StatTile
          label="BLENDED SALE avg price"
          value={blended.value}
          tone={blended.tone}
          caption="→ feeds the GCI Calculator"
          testId="avg-blended"
        />
        <StatTile
          label="Rental annual GCI (YTD)"
          value={formatPHP(report.rentalAnnualGci)}
          caption="one month of annual rent, reported separately"
          testId="rental-annual-gci"
        />
      </div>
    </section>
  );
}
