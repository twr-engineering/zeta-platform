import Link from "next/link";

import { formatPHP, toMoney } from "@/lib/money";
import { paymentsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type {
  MonthlySection as MonthlyData,
  MonthlyRow,
} from "@/lib/dashboard/sections";

import { DashboardSection } from "./section";

/**
 * Section 6 — MONTHLY CASH-IN (M6 §3.3, FR-M6-07). Twelve month rows for the
 * selected year (always all 12, rule 19): collected net, net cash, # payments, the
 * running cumulative, the straight-line cumulative target (target × m ÷ 12) and the
 * signed +/− against it. Restated by the year filter (with Section 2 only). Every
 * figure is the server builder's string; each month with a payment drills down to
 * that month's payments. Sign of the +/− is a display tone decision, never math.
 */

const MONTH_LABEL = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** A signed +/− cell: red when behind target, green when ahead, "—" when no target. */
function VarianceValue({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const negative = toMoney(value).isNegative();
  return (
    <span
      className={cn(
        "tabular-nums",
        negative ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"
      )}
    >
      {formatPHP(value)}
    </span>
  );
}

export function MonthlySection({ data }: { data: MonthlyData }) {
  const { dashboardYear: year, rows } = data;

  return (
    <DashboardSection
      index={6}
      title="Monthly Cash-In"
      description={`Month-by-month collections in ${year} against a straight-line target.`}
      testId="section-monthly"
    >
      {/* desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border ring-1 ring-foreground/5 md:block">
        <table className="w-full text-sm" data-testid="monthly-table">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium">Month</th>
              <th className="px-3 py-2.5 text-right font-medium">Collected Net</th>
              <th className="px-3 py-2.5 text-right font-medium">Net Cash</th>
              <th className="px-3 py-2.5 text-right font-medium">#</th>
              <th className="px-3 py-2.5 text-right font-medium">Cum. Collected</th>
              <th className="px-3 py-2.5 text-right font-medium">Cum. Target</th>
              <th className="px-3 py-2.5 text-right font-medium">+/−</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <MonthlyTableRow key={row.month} row={row} year={year} />
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-2 md:hidden" data-testid="monthly-cards">
        {rows.map((row) => (
          <li key={row.month}>
            <MonthlyCard row={row} year={year} />
          </li>
        ))}
      </ul>
    </DashboardSection>
  );
}

function MonthLink({
  row,
  year,
  children,
  className,
}: {
  row: MonthlyRow;
  year: number;
  children: React.ReactNode;
  className?: string;
}) {
  if (row.payments === 0) {
    return <span className={cn("text-muted-foreground", className)}>{children}</span>;
  }
  return (
    <Link
      href={paymentsPath({ year, month: row.month })}
      className={cn("font-medium text-primary hover:underline", className)}
      data-testid={`monthly-link-${row.month}`}
    >
      {children}
    </Link>
  );
}

function MonthlyTableRow({ row, year }: { row: MonthlyRow; year: number }) {
  const empty = row.payments === 0;
  return (
    <tr
      className={cn("border-t hover:bg-muted/40", empty && "text-muted-foreground")}
      data-testid="monthly-row"
      data-month={row.month}
    >
      <td className="px-3 py-2.5">
        <MonthLink row={row} year={year}>
          {MONTH_LABEL[row.month - 1]}
        </MonthLink>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(row.collectedNet)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(row.netCash)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{row.payments}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
        {formatPHP(row.cumulativeCollected)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {row.cumulativeTarget === null ? "—" : formatPHP(row.cumulativeTarget)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <VarianceValue value={row.vsTarget} />
      </td>
    </tr>
  );
}

function MonthlyCard({ row, year }: { row: MonthlyRow; year: number }) {
  return (
    <div
      className="rounded-xl border p-3"
      data-testid="monthly-card"
      data-month={row.month}
    >
      <div className="flex items-center justify-between">
        <MonthLink row={row} year={year} className="text-sm">
          {MONTH_LABEL[row.month - 1]} {year}
        </MonthLink>
        <span className="text-xs text-muted-foreground">
          {row.payments} payment{row.payments === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">Collected</span>
        <span className="text-right tabular-nums">{formatPHP(row.collectedNet)}</span>
        <span className="text-muted-foreground">Cumulative</span>
        <span className="text-right tabular-nums font-medium">{formatPHP(row.cumulativeCollected)}</span>
        <span className="text-muted-foreground">vs target</span>
        <span className="text-right">
          <VarianceValue value={row.vsTarget} />
        </span>
      </div>
    </div>
  );
}
