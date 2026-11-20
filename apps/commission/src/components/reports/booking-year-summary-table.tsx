import { formatPHP } from "@/lib/money";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { allZero } from "@/lib/reports/display";
import type { BookingYearSummaryReport } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * M8.3 — Report 5 table (§3.6). One row per booking year in the rule-2 union range
 * (a paid-only year is a Deals-0 row; a booked/no-cash year is a zero-money row),
 * bold TOTAL. Reads deals + receivables, never the payment ledger.
 *
 * WRITTEN-OFF COLUMN (OQ4 / master PRD Q18 "Split, flagged as sheet departure").
 * The v30.20 sheet lumps cancelled deals' written-off balances INTO Outstanding;
 * this SaaS splits them into their own column so Outstanding is open balances only
 * (matching M6's position block). That changes the sheet's Outstanding only on a
 * workspace carrying cancelled deals — so the column is marked as a deliberate
 * departure on screen (⚑) rather than silently diverging from the workbook.
 */
const WRITTEN_OFF_NOTE =
  "Departure from the workbook: cancelled deals' written-off balances are split into this column instead of being lumped into Outstanding, so Outstanding shows open balances only. This changes the sheet's numbers only where cancelled deals exist.";

export function BookingYearSummaryTable({
  report,
}: {
  report: BookingYearSummaryReport;
}) {
  const { rows, total } = report;

  return (
    <section data-testid="booking-year-summary" className="space-y-4">
      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Booking year</th>
              <th className="px-3 py-2 text-right font-medium">Deals</th>
              <th className="px-3 py-2 text-right font-medium">GCI (Net of VAT)</th>
              <th className="px-3 py-2 text-right font-medium">Collected</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              <th className="px-3 py-2 text-right font-medium" data-testid="written-off-header">
                <span className="inline-flex items-center justify-end gap-1">
                  Written off
                  <Tooltip>
                    <TooltipTrigger
                      render={<Info className="size-3.5 shrink-0 cursor-help text-amber-600 dark:text-amber-400" />}
                      tabIndex={0}
                      aria-label="Why is Written off a separate column?"
                      data-testid="written-off-departure"
                    />
                    <TooltipContent className="max-w-xs text-left font-normal normal-case">
                      {WRITTEN_OFF_NOTE}
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const zero =
                row.deals === 0 &&
                allZero(row.gci, row.collected, row.outstanding, row.writtenOff);
              return (
                <tr
                  key={row.year}
                  className={cn("border-t", zero && "text-muted-foreground")}
                  data-testid="booking-row"
                  data-year={row.year}
                >
                  <td className="px-3 py-2 font-medium">{row.year}</td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="booking-deals">
                    {row.deals}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="booking-gci">
                    {formatPHP(row.gci)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="booking-collected">
                    {formatPHP(row.collected)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="booking-outstanding">
                    {formatPHP(row.outstanding)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="booking-written-off">
                    {formatPHP(row.writtenOff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold" data-testid="booking-total-row">
              <td className="px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="booking-total-deals">
                {total.deals}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="booking-total-gci">
                {formatPHP(total.gci)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="booking-total-collected">
                {formatPHP(total.collected)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="booking-total-outstanding">
                {formatPHP(total.outstanding)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="booking-total-written-off">
                {formatPHP(total.writtenOff)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-2 sm:hidden" data-testid="booking-cards">
        {rows.map((row) => {
          const zero =
            row.deals === 0 &&
            allZero(row.gci, row.collected, row.outstanding, row.writtenOff);
          return (
            <li
              key={row.year}
              className={cn("rounded-xl border p-3", zero && "text-muted-foreground")}
              data-testid="booking-card"
              data-year={row.year}
            >
              <div className="flex items-center justify-between font-medium">
                <span>{row.year}</span>
                <span className="text-xs text-muted-foreground">{row.deals} deals</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">GCI (Net of VAT)</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.gci)}</dd>
                <dt className="text-muted-foreground">Collected</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.collected)}</dd>
                <dt className="text-muted-foreground">Outstanding</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.outstanding)}</dd>
                <dt className="text-muted-foreground">Written off ⚑</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.writtenOff)}</dd>
              </dl>
            </li>
          );
        })}
        <li className="rounded-xl border-2 bg-muted/50 p-3 font-semibold" data-testid="booking-total-card">
          <div className="flex items-center justify-between">
            <span>TOTAL</span>
            <span className="text-xs font-normal text-muted-foreground">{total.deals} deals</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm font-normal">
            <dt className="text-muted-foreground">GCI (Net of VAT)</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.gci)}</dd>
            <dt className="text-muted-foreground">Collected</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.collected)}</dd>
            <dt className="text-muted-foreground">Outstanding</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.outstanding)}</dd>
            <dt className="text-muted-foreground">Written off ⚑</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.writtenOff)}</dd>
          </dl>
        </li>
      </ul>

      <p className="text-xs text-muted-foreground" data-testid="written-off-note">
        ⚑ <strong>Written off</strong> is split out from Outstanding — a deliberate
        departure from the workbook (see the column tooltip).
      </p>
    </section>
  );
}
