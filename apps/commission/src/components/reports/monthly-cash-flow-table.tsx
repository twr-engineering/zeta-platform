import { formatPHP } from "@/lib/money";
import { allZero, monthName } from "@/lib/reports/display";
import type { MonthlyCashFlowReport } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * M8.3 — Report 3 table (§3.4). Always all twelve months (rule 4), zeros at reduced
 * emphasis; bold TOTAL. Read-only; every figure is the M8.1 aggregator's. Desktop =
 * table; 360px = stacked cards (§6).
 */
export function MonthlyCashFlowTable({ report }: { report: MonthlyCashFlowReport }) {
  const { rows, total } = report;

  return (
    <section data-testid="monthly-cash-flow" className="space-y-4">
      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium">Net of VAT</th>
              <th className="px-3 py-2 text-right font-medium">Net Cash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const zero = allZero(row.netOfVat, row.netCash);
              return (
                <tr
                  key={row.month}
                  className={cn("border-t", zero && "text-muted-foreground")}
                  data-testid="cashflow-row"
                  data-month={row.month}
                >
                  <td className="px-3 py-2 font-medium">{monthName(row.month)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="cashflow-net-of-vat">
                    {formatPHP(row.netOfVat)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="cashflow-net-cash">
                    {formatPHP(row.netCash)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold" data-testid="cashflow-total-row">
              <td className="px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="cashflow-total-net-of-vat">
                {formatPHP(total.netOfVat)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="cashflow-total-net-cash">
                {formatPHP(total.netCash)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden" data-testid="cashflow-cards">
        {rows.map((row) => {
          const zero = allZero(row.netOfVat, row.netCash);
          return (
            <li
              key={row.month}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2.5",
                zero && "text-muted-foreground"
              )}
              data-testid="cashflow-card"
              data-month={row.month}
            >
              <span className="font-medium">{monthName(row.month)}</span>
              <span className="text-right text-sm tabular-nums">
                <span className="block">{formatPHP(row.netOfVat)}</span>
                <span className="block text-xs text-muted-foreground">
                  Net Cash {formatPHP(row.netCash)}
                </span>
              </span>
            </li>
          );
        })}
        <li
          className="flex items-center justify-between rounded-xl border-2 bg-muted/50 px-3 py-2.5 font-semibold"
          data-testid="cashflow-total-card"
        >
          <span>TOTAL</span>
          <span className="text-right text-sm tabular-nums">
            <span className="block">{formatPHP(total.netOfVat)}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Net Cash {formatPHP(total.netCash)}
            </span>
          </span>
        </li>
      </ul>
    </section>
  );
}
