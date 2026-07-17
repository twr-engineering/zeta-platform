import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listReceivables, receivablePayor } from "@/lib/receivables/queries";
import { formatPHP } from "@/lib/money";
import { ROUTES, dealDetailPath } from "@/lib/routes";
import type { ReceivableStatus } from "@/types/entities";

export const metadata: Metadata = { title: "Collectibles" };

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

/**
 * The receivables ledger (M4). One receivable per deal, created automatically from
 * the deal event log — there is no create button, by design (§6). M4.1 renders the
 * real (RLS-scoped, money-exact) list and its empty state; the full ledger — filters,
 * chase-priority sort, % progress bars, the Adjust/Close/Cancel flows — is M4.4, and
 * the payment-derived money columns fill in with M4.2.
 */
export default async function CollectiblesPage() {
  const receivables = await listReceivables({ includeArchived: false });

  if (receivables.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<Wallet />}
          title="Receivables appear here automatically — one per deal"
          description="Each deal you log gets a receivable tracking the commission you're owed against the cash you collect. Log your first deal to start."
          action={
            <Button nativeButton={false} render={<Link href={ROUTES.deals} />}>
              Go to Deals
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Collectibles</h1>
        <p className="text-sm text-muted-foreground">
          One receivable per deal: what each payor owes you.{" "}
          <span className="text-muted-foreground/80">
            Booked NET GCI = earned after referral-outs; Total Collectible = the full cash you expect in.
          </span>
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Deal</th>
              <th className="px-3 py-2 font-medium">Payor</th>
              <th className="px-3 py-2 text-right font-medium">Booked NET GCI</th>
              <th className="px-3 py-2 text-right font-medium">Total Collectible</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {receivables.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={dealDetailPath(r.deal_code)}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.deal_code}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{r.client_name}</span>
                </td>
                <td className="px-3 py-2">{receivablePayor(r)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPHP(r.booked_net_gci)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPHP(r.total_collectible)}
                  {r.confirmed_collectible !== null && (
                    <span
                      className="ml-1 text-xs text-primary"
                      title={`Default ${formatPHP(r.default_total_collectible)} → confirmed ${formatPHP(
                        r.confirmed_collectible
                      )}`}
                    >
                      ●
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline">{STATUS_LABEL[r.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
