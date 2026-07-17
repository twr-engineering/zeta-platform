import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "@/components/payments/payment-form";
import { listActivePaymentDeals } from "@/lib/payments/queries";
import { manilaToday } from "@/lib/date/manila";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Log a release" };

type PageProps = { searchParams: Promise<{ deal?: string }> };

/**
 * The fast-entry surface (M5.2, §6.1) — "log a release in under 30 seconds." The
 * active-deal index is loaded once here and handed to the client form, which
 * filters it in the browser for the type-ahead picker (< 150 ms, §8) and calls
 * the real engine (previewPayment) for the live split. Today defaults in the
 * workspace timezone (Asia/Manila, rule 20/AC18) — computed server-side, never
 * from UTC.
 *
 * The `?deal=` param preselects a deal (the deal detail's "Log a payment"
 * cross-link, §6.3). Empty state routes to logging or importing a deal first —
 * there is nothing to log a release against without one.
 */
export default async function LogReleasePage({ searchParams }: PageProps) {
  const [{ deal: dealParam }, deals] = await Promise.all([
    searchParams,
    listActivePaymentDeals(),
  ]);

  if (deals.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<Banknote />}
          title="Log a release against a deal"
          description="Payments record commission the developer or client actually released. You need a deal first — log one, or import your workbook."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button nativeButton={false} render={<Link href={ROUTES.dealNew} />}>
                Log a deal
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={ROUTES.dealImport} />}>
                Import workbook
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const initialDealId = dealParam && deals.some((d) => d.id === dealParam) ? dealParam : "";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Log a release</h1>
        <p className="text-sm text-muted-foreground">
          Pick the deal, enter the gross the payor released, and the tax split appears live —
          Net of VAT, VAT, EWT, and the Net Cash that reaches your bank.
        </p>
      </header>

      <PaymentForm deals={deals} today={manilaToday()} initialDealId={initialDealId} />
    </div>
  );
}
