import { formatPHP } from "@/lib/money";
import { allZero } from "@/lib/reports/display";
import type { CashPerYearReport } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * M8.3 — Report 1 table (§3.2). One row per paid year in the rule-2 range (zero rows
 * at reduced emphasis, not gaps), a bold TOTAL with a top rule. Read-only "black
 * cells": every figure is the M8.1 aggregator's string, the UI computes nothing.
 * Desktop = table; 360px = stacked cards (§6 mobile).
 */
export function CashPerYearTable({ report }: { report: CashPerYearReport }) {
  const { rows, total } = report;

  return (
    <section data-testid="cash-per-year" className="space-y-4">
      {/* desktop / tablet */}
      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Year</th>
              <th className="px-3 py-2 text-right font-medium">Net of VAT</th>
              <th className="px-3 py-2 text-right font-medium">Net Cash</th>
              <th className="px-3 py-2 text-right font-medium">Output VAT</th>
              <th className="px-3 py-2 text-right font-medium">EWT</th>
              <th className="px-3 py-2 text-right font-medium"># Payments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const zero = allZero(row.netOfVat, row.netCash, row.outputVat, row.ewt);
              return (
                <tr
                  key={row.year}
                  className={cn("border-t", zero && "text-muted-foreground")}
                  data-testid="cash-year-row"
                  data-year={row.year}
                >
                  <td className="px-3 py-2 font-medium">{row.year}</td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="cash-net-of-vat">
                    {formatPHP(row.netOfVat)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPHP(row.netCash)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPHP(row.outputVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPHP(row.ewt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.payments}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold" data-testid="cash-total-row">
              <td className="px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="cash-total-net-of-vat">
                {formatPHP(total.netOfVat)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(total.netCash)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(total.outputVat)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(total.ewt)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{total.payments}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-2 sm:hidden" data-testid="cash-cards">
        {rows.map((row) => {
          const zero = allZero(row.netOfVat, row.netCash, row.outputVat, row.ewt);
          return (
            <li
              key={row.year}
              className={cn("rounded-xl border p-3", zero && "text-muted-foreground")}
              data-testid="cash-card"
              data-year={row.year}
            >
              <div className="flex items-center justify-between font-medium">
                <span>{row.year}</span>
                <span className="tabular-nums">{formatPHP(row.netOfVat)}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Net Cash</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.netCash)}</dd>
                <dt className="text-muted-foreground">Output VAT</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.outputVat)}</dd>
                <dt className="text-muted-foreground">EWT</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.ewt)}</dd>
                <dt className="text-muted-foreground"># Payments</dt>
                <dd className="text-right tabular-nums">{row.payments}</dd>
              </dl>
            </li>
          );
        })}
        <li className="rounded-xl border-2 bg-muted/50 p-3 font-semibold" data-testid="cash-total-card">
          <div className="flex items-center justify-between">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatPHP(total.netOfVat)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm font-normal">
            <dt className="text-muted-foreground">Net Cash</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.netCash)}</dd>
            <dt className="text-muted-foreground">Output VAT</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.outputVat)}</dd>
            <dt className="text-muted-foreground">EWT</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.ewt)}</dd>
            <dt className="text-muted-foreground"># Payments</dt>
            <dd className="text-right tabular-nums">{total.payments}</dd>
          </dl>
        </li>
      </ul>
    </section>
  );
}
