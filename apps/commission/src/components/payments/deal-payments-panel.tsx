"use client";

import Link from "next/link";
import { Banknote, Pencil, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatManilaDate } from "@/lib/date/manila";
import { equalsToCentavo, formatPHP, formatRateAsPercent } from "@/lib/money";
import { paymentEditPath, paymentNewPath } from "@/lib/routes";
import { staleBasisExplanation } from "@/lib/payments/stale";
import type { PaymentRow } from "@/lib/payments/queries";

/**
 * The per-deal payments panel (FR-M5-06, §6.3) — the ONE component embedded on both
 * the deal detail (M1) and the receivable view (M4), replacing M4.4's read-only
 * receivable-payments table. Newest-first release rows with their stored tax split,
 * a running collected total vs Total Collectible ("₱44,642.86 of ₱354,591.84 ·
 * 12.6%" — ties centavo-exact to M4's Collected/Total Collectible, AC17), a
 * per-row stale-basis ⚠ + edit link, and a "Log a payment" button that pre-fills the
 * fast-entry form with this deal (§6.3).
 *
 * The collected/total figures come from the receivable (M4.2's Rule L/M columns),
 * never re-summed in the UI — the panel shows the same numbers the ledger does.
 */

const PAYMENT_TYPE_LABEL: Record<PaymentRow["payment_type"], string> = {
  commission: "Commission",
  incentive: "Incentive",
};

export type DealPaymentsPanelProps = {
  payments: readonly PaymentRow[];
  /** The deal to pre-fill the fast-entry form with (§6.3 "Log a payment"). */
  dealId: string;
  /** Running-total context from the receivable (M4.2). Null before M4 restates. */
  collectedNet: string | null;
  totalCollectible: string | null;
  pctCollected: string | null;
  /** Current workspace rates — the stale-basis anchors (FR-M5-12). */
  currentRates: { ewt_rate: string; vat_rate: string };
};

export function DealPaymentsPanel({
  payments,
  dealId,
  collectedNet,
  totalCollectible,
  pctCollected,
  currentRates,
}: DealPaymentsPanelProps) {
  return (
    <div className="space-y-4" data-testid="deal-payments-panel">
      {/* Running total vs Total Collectible (§6.3, AC17) */}
      {collectedNet !== null && totalCollectible !== null && (
        <div
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
          data-testid="deal-payments-running-total"
        >
          <span className="font-medium tabular-nums">{formatPHP(collectedNet)}</span>
          <span className="text-muted-foreground">
            of {formatPHP(totalCollectible)} collected
          </span>
          {pctCollected !== null && (
            <span className="tabular-nums text-muted-foreground">
              · {formatRateAsPercent(pctCollected)}
            </span>
          )}
        </div>
      )}

      {payments.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" data-testid="payment-history-empty">
            No payments logged yet.
          </p>
          <LogPaymentButton dealId={dealId} />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto" data-testid="payment-history">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 text-right font-medium">Gross</th>
                  <th className="py-2 pr-3 text-right font-medium">Net of VAT</th>
                  <th className="py-2 pr-3 text-right font-medium">VAT</th>
                  <th className="py-2 pr-3 text-right font-medium">EWT</th>
                  <th className="py-2 pr-3 text-right font-medium">Net Cash</th>
                  <th className="py-2 pr-3 font-medium">Note</th>
                  <th className="py-2 text-right font-medium"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <PanelRow key={p.id} p={p} currentRates={currentRates} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <LogPaymentButton dealId={dealId} />
          </div>
        </>
      )}
    </div>
  );
}

function LogPaymentButton({ dealId }: { dealId: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={paymentNewPath(dealId)} />}
      data-testid="panel-log-payment"
    >
      <Banknote className="size-4" /> Log a payment
    </Button>
  );
}

function TaxCell({ value }: { value: string }) {
  if (equalsToCentavo(value, "0")) {
    return <span className="text-xs text-muted-foreground">untaxed</span>;
  }
  return <span className="tabular-nums text-muted-foreground">{formatPHP(value)}</span>;
}

function PanelRow({
  p,
  currentRates,
}: {
  p: PaymentRow;
  currentRates: { ewt_rate: string; vat_rate: string };
}) {
  const stale = p.deal
    ? staleBasisExplanation(p, {
        vat_basis: p.deal.vat_basis,
        ewt_rate: currentRates.ewt_rate,
        vat_rate: currentRates.vat_rate,
      })
    : null;
  return (
    <tr className="border-b last:border-0" data-testid="payment-history-row" data-payment-id={p.id}>
      <td className="py-2 pr-3 whitespace-nowrap">{formatManilaDate(p.payment_date)}</td>
      <td className="py-2 pr-3">
        <span className="inline-flex items-center gap-1.5">
          <Badge variant={p.payment_type === "incentive" ? "secondary" : "outline"}>
            {PAYMENT_TYPE_LABEL[p.payment_type]}
          </Badge>
          {stale && (
            <Tooltip>
              <TooltipTrigger
                tabIndex={0}
                className="cursor-help"
                render={
                  <span
                    data-testid="stale-basis-flag"
                    className="inline-flex items-center rounded bg-amber-100 p-0.5 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                  >
                    <TriangleAlert className="size-3" />
                  </span>
                }
              />
              <TooltipContent>{stale}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{formatPHP(p.gross_amount)}</td>
      <td className="py-2 pr-3 text-right tabular-nums font-medium">{formatPHP(p.net_of_vat)}</td>
      <td className="py-2 pr-3 text-right"><TaxCell value={p.vat_amount} /></td>
      <td className="py-2 pr-3 text-right"><TaxCell value={p.ewt_amount} /></td>
      <td className="py-2 pr-3 text-right tabular-nums">{formatPHP(p.net_cash)}</td>
      <td className="py-2 pr-3 text-muted-foreground max-w-[10rem] truncate" title={p.reference_note ?? undefined}>
        {p.reference_note ?? "—"}
      </td>
      <td className="py-2 text-right">
        <Link
          href={paymentEditPath(p.id)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          data-testid="payment-edit-link"
        >
          <Pencil className="size-3.5" /> Edit
        </Link>
      </td>
    </tr>
  );
}
