"use client";

import { StatTile } from "@/components/dashboard/stat-tile";
import { formatPHP, toMoney } from "@/lib/money";
import type { Pace } from "@/lib/planning";

/**
 * M3.3 §6 pace block (FR-M3-08, Rules P11–P13). Total Sales required is real today
 * (= GCI goal ÷ yield). YTD actual booked + Balance to target are M3.4's live aggregate
 * (Rule P12) — until then this renders the documented seam: a muted "—" that names when
 * the live figure arrives. When M3.4 supplies the aggregate the same tiles light up with
 * ahead/behind coloring (balance < 0 = target beaten).
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
        caption={hasYtd ? "Booked this plan year" : "Live year-to-date pace lands with M3.4"}
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
            : "Live year-to-date pace lands with M3.4"
        }
      />
    </div>
  );
}
