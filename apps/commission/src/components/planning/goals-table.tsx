"use client";

import { formatAmount, formatPHP } from "@/lib/money";
import type { GoalRow, Plan } from "@/lib/planning";

/**
 * M3.3 §6 goals table (FR-M3-06): GCI, Net Income, Listings SOLD and Buyer ATP, each
 * broken Yearly / Monthly / Weekly per Rule P8 (Monthly = ÷12, Weekly = Monthly ÷4 =
 * ÷48/year — the 48-working-week assumption is stated in the caption). GCI and Net
 * Income are money; the deal counts render at 2 dp (never silently ceil'd — rule 6).
 */
export function GoalsTable({ goals }: { goals: Plan["goals"] }) {
  const rows: { key: string; label: string; row: GoalRow; money: boolean }[] = [
    { key: "gci", label: "GCI goal", row: goals.gci, money: true },
    { key: "net-income", label: "Net Income", row: goals.netIncome, money: true },
    { key: "listings-sold", label: "Listings SOLD (deals)", row: goals.listingsSold, money: false },
    { key: "buyer-atp", label: "Buyer ATP (deals)", row: goals.buyerAtp, money: false },
  ];

  const fmt = (v: string, money: boolean) => (money ? formatPHP(v) : formatAmount(v));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border ring-1 ring-foreground/5">
        <table className="w-full text-sm" data-testid="goals-table">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Goal</th>
              <th className="px-3 py-2 text-right font-medium">Yearly</th>
              <th className="px-3 py-2 text-right font-medium">Monthly</th>
              <th className="px-3 py-2 text-right font-medium">Weekly</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, row, money }) => (
              <tr key={key} className="border-b last:border-0" data-testid={`goal-${key}`}>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {label}
                </th>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`goal-${key}-yearly`}>
                  {fmt(row.yearly, money)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`goal-${key}-monthly`}>
                  {fmt(row.monthly, money)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`goal-${key}-weekly`}>
                  {fmt(row.weekly, money)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Monthly = Yearly ÷ 12; Weekly = Monthly ÷ 4 — the model assumes 48 working weeks a year.
      </p>
    </div>
  );
}
