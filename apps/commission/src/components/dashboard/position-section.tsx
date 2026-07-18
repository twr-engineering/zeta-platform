import { formatPHP, formatRateAsPercent, toMoney } from "@/lib/money";
import { collectiblesPath, paymentsPath, ROUTES } from "@/lib/routes";
import type { PositionSection as PositionData } from "@/lib/dashboard/sections";

import { DashboardSection } from "./section";
import { StatTile } from "./stat-tile";

/**
 * Section 1 — COLLECTION POSITION (M6 §3.3, FR-M6-01). Eight tiles over ALL
 * receivables/payments, unaffected by the year filter. Every figure is the display
 * string the server builder produced; the tiles only format and drill down. Money
 * comparisons for tone (is the referral/variance non-zero?) use the Money type on
 * already-computed totals — a display decision, never a re-aggregation.
 */
export function PositionSection({ data }: { data: PositionData }) {
  const writtenOff = toMoney(data.writtenOff);
  const variance = toMoney(data.varianceRealized);
  const referral = toMoney(data.referralOwed);

  return (
    <DashboardSection
      index={1}
      title="Collection Position"
      description="Lifetime — every deal, all statuses. The year filter does not touch this."
      testId="section-position"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Total Collectible"
          value={formatPHP(data.totalCollectible)}
          caption="Full cash you expect in"
          href={collectiblesPath()}
          hrefTitle="View all receivables"
          testId="tile-total-collectible"
        />
        <StatTile
          label="Total Collected"
          value={formatPHP(data.collectedNet)}
          caption="Net of VAT, all payments"
          href={collectiblesPath()}
          hrefTitle="View all receivables"
          testId="tile-total-collected"
        />
        <StatTile
          label="Balance Outstanding"
          value={formatPHP(data.balanceOutstanding)}
          caption="Open receivables still owing"
          href={collectiblesPath({ status: "open", hasBalance: true })}
          hrefTitle="View open receivables with a balance"
          testId="tile-balance-outstanding"
        />
        <StatTile
          label="% Collected"
          value={data.pctCollected === null ? "—" : formatRateAsPercent(data.pctCollected)}
          tone={data.pctCollected === null ? "muted" : "default"}
          caption="Collected ÷ Collectible"
          href={collectiblesPath()}
          hrefTitle="View all receivables"
          testId="tile-pct-collected"
        />
        <StatTile
          label="Written-off"
          value={formatPHP(data.writtenOff)}
          tone={writtenOff.isZero() ? "muted" : "negative"}
          caption="Uncollected on Cancelled deals"
          href={collectiblesPath({ status: "cancelled" })}
          hrefTitle="View cancelled receivables"
          testId="tile-written-off"
        />
        <StatTile
          label="Variance realized"
          value={formatPHP(data.varianceRealized)}
          tone={variance.isZero() ? "muted" : variance.isNegative() ? "negative" : "positive"}
          caption="Short / over on Closed deals"
          href={collectiblesPath({ status: "closed" })}
          hrefTitle="View closed receivables"
          testId="tile-variance"
        />
        <StatTile
          label="Net Cash received"
          value={formatPHP(data.netCashReceived)}
          caption="What actually hit the bank"
          href={paymentsPath()}
          hrefTitle="View all payments"
          testId="tile-net-cash"
        />
        <StatTile
          label="Referral fees owed out"
          value={formatPHP(data.referralOwed)}
          tone={referral.isZero() ? "muted" : "negative"}
          caption={`across ${data.referralOwedDeals} deal${data.referralOwedDeals === 1 ? "" : "s"}`}
          href={ROUTES.deals}
          hrefTitle="View deals with referral fees to pay"
          testId="tile-referral-owed"
        />
      </div>
    </DashboardSection>
  );
}
