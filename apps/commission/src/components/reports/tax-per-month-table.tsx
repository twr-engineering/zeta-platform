import { formatPHP } from "@/lib/money";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { allZero, monthName } from "@/lib/reports/display";
import type { TaxPerMonthReport } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * M8.3 — Report 4 table (§3.5 / FR-M8-07). The month-by-month tax view the agent
 * hands their accountant: Output VAT to remit, EWT withheld (the 2307 credit), the
 * Net-of-VAT base, and the payment count — all twelve months (rule 4), bold TOTAL.
 * The two tax columns carry the verbatim plain-language captions (FR-M8-07) plus a
 * tooltip with the fuller tax meaning (§3.5), so a reader with no PH-tax background
 * knows exactly what to do with each number. Read-only; figures are M8.1's.
 */
const VAT_MEANING =
  "Output VAT — what you owe the BIR out of this month's receipts. The 12% VAT arrives inside collected commissions but is never your income; it must be remitted.";
const EWT_MEANING =
  "EWT withheld — tax the payor already held back before paying you. It is creditable: it offsets your income tax at filing. The payor issues a BIR Form 2307 per withholding; hold these as proof of the credit.";

export function TaxPerMonthTable({ report }: { report: TaxPerMonthReport }) {
  const { rows, total } = report;

  return (
    <section data-testid="tax-per-month" className="space-y-4">
      <div className="hidden overflow-x-auto rounded-xl border sm:block print:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium" data-testid="tax-vat-header">
                <span className="inline-flex items-center justify-end gap-1">
                  Output VAT — to remit to BIR
                  <TaxInfo label="What is Output VAT?" text={VAT_MEANING} />
                </span>
              </th>
              <th className="px-3 py-2 text-right font-medium" data-testid="tax-ewt-header">
                <span className="inline-flex items-center justify-end gap-1">
                  EWT withheld — creditable, BIR Form 2307
                  <TaxInfo label="What is EWT withheld?" text={EWT_MEANING} />
                </span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Net of VAT (base)</th>
              <th className="px-3 py-2 text-right font-medium"># Payments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const zero = allZero(row.outputVat, row.ewt, row.netOfVatBase);
              return (
                <tr
                  key={row.month}
                  className={cn("border-t", zero && "text-muted-foreground")}
                  data-testid="tax-row"
                  data-month={row.month}
                >
                  <td className="px-3 py-2 font-medium">{monthName(row.month)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="tax-output-vat">
                    {formatPHP(row.outputVat)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="tax-ewt">
                    {formatPHP(row.ewt)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="tax-base">
                    {formatPHP(row.netOfVatBase)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="tax-payments">
                    {row.payments}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold" data-testid="tax-total-row">
              <td className="px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="tax-total-output-vat">
                {formatPHP(total.outputVat)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="tax-total-ewt">
                {formatPHP(total.ewt)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="tax-total-base">
                {formatPHP(total.netOfVatBase)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="tax-total-payments">
                {total.payments}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile cards — never printed (the desktop table is the hand-off layout) */}
      <ul className="space-y-2 sm:hidden print:hidden" data-testid="tax-cards">
        <li className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <p className="mb-1">
            <strong className="text-foreground">Output VAT</strong> — {VAT_MEANING.split(" — ")[1]}
          </p>
          <p>
            <strong className="text-foreground">EWT withheld</strong> — {EWT_MEANING.split(" — ")[1]}
          </p>
        </li>
        {rows.map((row) => {
          const zero = allZero(row.outputVat, row.ewt, row.netOfVatBase);
          return (
            <li
              key={row.month}
              className={cn("rounded-xl border p-3", zero && "text-muted-foreground")}
              data-testid="tax-card"
              data-month={row.month}
            >
              <div className="flex items-center justify-between font-medium">
                <span>{monthName(row.month)}</span>
                <span className="text-xs text-muted-foreground">{row.payments} payments</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Output VAT (remit)</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.outputVat)}</dd>
                <dt className="text-muted-foreground">EWT (2307 credit)</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.ewt)}</dd>
                <dt className="text-muted-foreground">Net of VAT base</dt>
                <dd className="text-right tabular-nums">{formatPHP(row.netOfVatBase)}</dd>
              </dl>
            </li>
          );
        })}
        <li className="rounded-xl border-2 bg-muted/50 p-3 font-semibold" data-testid="tax-total-card">
          <div className="flex items-center justify-between">
            <span>TOTAL</span>
            <span className="text-xs font-normal text-muted-foreground">{total.payments} payments</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm font-normal">
            <dt className="text-muted-foreground">Output VAT (remit)</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.outputVat)}</dd>
            <dt className="text-muted-foreground">EWT (2307 credit)</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.ewt)}</dd>
            <dt className="text-muted-foreground">Net of VAT base</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.netOfVatBase)}</dd>
          </dl>
        </li>
      </ul>
    </section>
  );
}

/** A small ⓘ that names a tax column's meaning on hover/focus (§3.5, M10 help copy). */
function TaxInfo({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Info className="size-3.5 shrink-0 cursor-help text-muted-foreground" />}
        tabIndex={0}
        aria-label={label}
      />
      <TooltipContent className="max-w-xs text-left font-normal normal-case">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
