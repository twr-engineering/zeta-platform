import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PaymentEditForm } from "@/components/payments/payment-edit-form";
import { getPayment, getWorkspaceRates, resolvePaymentDeal } from "@/lib/payments/queries";
import { getReceivableByDealId } from "@/lib/receivables/queries";
import { isStaleBasis } from "@/lib/payments/stale";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Edit payment" };

type PageProps = { params: Promise<{ id: string }> };

/**
 * The payment edit / recompute screen (FR-M5-07/10, §6.2/§6.4). Gross, date, type
 * and note are editable; the deal reference is shown but fixed (re-pointing a
 * payment to another deal is not a daily-use path). Saving RE-SNAPSHOTS the split
 * at the deal + settings as they are now (§3.3.2) — so the form shows the STORED
 * split beside what a recompute would produce, and the save is friction-gated
 * (rule 11) with a field-level old→new audit entry.
 *
 * A stale-basis row (its stored `*_used` anchors drifted from today's deal +
 * settings — FR-M5-12) lands here to opt into a per-payment recompute (§3.3.3,
 * never bulk). Delete is friction-gated too and states the receivable restatement.
 */
export default async function EditPaymentPage({ params }: PageProps) {
  const { id } = await params;

  const payment = await getPayment(id);
  if (!payment) notFound();

  const [deal, receivable, currentRates] = await Promise.all([
    resolvePaymentDeal(payment.deal_id),
    getReceivableByDealId(payment.deal_id),
    getWorkspaceRates(),
  ]);

  // The deal must resolve for the recompute preview + the split's tax context. A
  // payment can only exist against a real, same-workspace deal (hard FK), so this
  // is defensive — if it ever fails, there is nothing to edit against.
  if (!deal.ok) notFound();

  const stale = isStaleBasis(payment, {
    vat_basis: deal.deal.vat_basis,
    ewt_rate: currentRates.ewt_rate,
    vat_rate: currentRates.vat_rate,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={ROUTES.payments} />}
          data-testid="back-to-payments"
        >
          <ArrowLeft className="size-4" /> Back to payments
        </Button>
      </div>

      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Edit payment</h1>
        <p className="text-sm text-muted-foreground">
          {deal.deal.display_label}
        </p>
      </header>

      <PaymentEditForm
        payment={payment}
        dealLabel={deal.deal.display_label}
        stale={stale}
        collectedNet={receivable?.collected_net ?? null}
        balance={receivable?.balance ?? null}
        totalCollectible={receivable?.total_collectible ?? null}
      />
    </div>
  );
}
