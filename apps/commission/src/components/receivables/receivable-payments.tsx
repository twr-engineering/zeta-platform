import { Badge } from "@/components/ui/badge";
import { formatManilaDate } from "@/lib/date/manila";
import { formatPHP } from "@/lib/money";
import type { PaymentRow } from "@/lib/payments/queries";

/**
 * The receivable's payment history (FR-M4-09) — read-only, newest first, from M5.
 * The per-payment tax splits (Net of VAT / VAT / EWT / Net Cash / Retained) are the
 * stored save-time snapshot and live HERE, not on the receivable (the v30.20
 * structure note: no per-deal tax columns on the entity). Editing happens in M5.
 */

const PAYMENT_TYPE_LABELS: Record<PaymentRow["payment_type"], string> = {
  commission: "Commission",
  incentive: "Incentive",
};

export function ReceivablePayments({ payments }: { payments: readonly PaymentRow[] }) {
  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="payment-history-empty">
        No payments logged yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="payment-history">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 text-right font-medium">Gross</th>
            <th className="py-2 pr-3 text-right font-medium">Net of VAT</th>
            <th className="py-2 pr-3 text-right font-medium">VAT</th>
            <th className="py-2 pr-3 text-right font-medium">EWT</th>
            <th className="py-2 pr-3 text-right font-medium">Net Cash</th>
            <th className="py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b last:border-0" data-testid="payment-history-row">
              <td className="py-2 pr-3 whitespace-nowrap">{formatManilaDate(p.payment_date)}</td>
              <td className="py-2 pr-3">
                <Badge variant="outline">{PAYMENT_TYPE_LABELS[p.payment_type]}</Badge>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatPHP(p.gross_amount)}</td>
              <td className="py-2 pr-3 text-right tabular-nums font-medium">{formatPHP(p.net_of_vat)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{formatPHP(p.vat_amount)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{formatPHP(p.ewt_amount)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatPHP(p.net_cash)}</td>
              <td className="py-2 text-muted-foreground">{p.reference_note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
