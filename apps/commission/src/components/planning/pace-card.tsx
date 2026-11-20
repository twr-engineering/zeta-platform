"use client";

import { StatTile } from "@/components/dashboard/stat-tile";
import { formatPHP, toMoney } from "@/lib/money";
import type { Pace } from "@/lib/planning";

/**
 * §6 pace block (FR-M3-08, Rules P11–P13). Total Sales required = GCI goal ÷ yield;
 * YTD actual booked is Rule P12's live aggregate (M3.4 — Sale+Rental, ≠Referrer, booked
 * this plan year) and Balance = Total − YTD, colored ahead (balance < 0 = target beaten)
 * or behind. A plan computed without an aggregate leaves YTD/Balance null → a muted "—"
 * (defensive; the calculator page and the export loader always supply the aggregate).
 */
export function PaceCard({ pace }: { pace: Pace }) {
  const hasYtd = pace.ytdActualSales !== null;
  const balanceAhead = pace.balanceToTarget !== null && toMoney(pace.balanceToTarget).isNegative();

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        testId="pace-total"
        label="Total Sales required"
        value={formatPHP(pace.totalSalesRequired)}
        caption="Volume you must transact — = GCI goal ÷ yield"
      />
      <StatTile
        testId="pace-ytd"
        label="YTD actual booked"
        value={hasYtd ? formatPHP(pace.ytdActualSales!) : "—"}
        tone={hasYtd ? "default" : "muted"}
        caption={hasYtd ? "Booked this plan year (sales + rentals)" : "No booked-sales read"}
      />
      <StatTile
        testId="pace-balance"
        label="Balance to target"
        value={pace.balanceToTarget !== null ? formatPHP(pace.balanceToTarget) : "—"}
        tone={pace.balanceToTarget === null ? "muted" : balanceAhead ? "positive" : "default"}
        caption={
          pace.balanceToTarget !== null
            ? balanceAhead
              ? "Ahead of target"
              : "Still to transact"
            : "No booked-sales read"
        }
      />
    </div>
  );
}
