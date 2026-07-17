import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { PaymentsList } from "@/components/payments/payments-list";
import { getWorkspaceRates, listPayments } from "@/lib/payments/queries";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Payments" };

/**
 * The payments list (M5.3, FR-M5-05, §6.2) — the read side of the daily-use
 * surface. Every release with its stored tax split, newest-first, filterable and
 * exportable. Identity columns join the CURRENT deal (renames propagate); the
 * split is the save-time snapshot (§3.1). The workspace's current rates ride along
 * so the list can flag rows whose stored `*_used` anchors have since drifted from
 * the deal + settings (stale-basis, FR-M5-12).
 *
 * The whole page is a single RLS-scoped read plus the tax settings; all filtering,
 * pagination and totals run client-side over those rows (§8 budget).
 */
export default async function PaymentsPage() {
  const [payments, currentRates] = await Promise.all([
    listPayments(),
    getWorkspaceRates(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Every commission release with its tax split — VAT, EWT, and the Net Cash that reached you.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={ROUTES.paymentNew} />} data-testid="log-release-cta">
          <Banknote className="size-4" /> Log a release
        </Button>
      </header>

      {payments.length === 0 ? (
        <EmptyState
          icon={<Banknote />}
          title="No payments yet"
          description="Log the first release against a deal — the tax split is computed and stored the moment you save."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button nativeButton={false} render={<Link href={ROUTES.paymentNew} />}>
                Log a release
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={ROUTES.dealImport} />}>
                Import workbook
              </Button>
            </div>
          }
        />
      ) : (
        <PaymentsList payments={payments} currentRates={currentRates} />
      )}
    </div>
  );
}
