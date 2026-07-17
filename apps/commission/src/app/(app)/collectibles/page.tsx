import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listReceivables, receivablePayor } from "@/lib/receivables/queries";
import { formatPHP, formatRateAsPercent, toMoney } from "@/lib/money";
import { ROUTES, dealDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
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
 * real (RLS-scoped, money-exact) list and its empty state; M4.2 filled the money
 * columns; M4.3 surfaces the restated-override "review" flag inline. The full ledger
 * — filters, % progress bars, and the Adjust/Close/Cancel/Reopen dialogs (with their
 * variance/write-off previews and the restated-override banner) — is M4.4.
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
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Deal</th>
              <th className="px-3 py-2 font-medium">Payor</th>
              <th className="px-3 py-2 text-right font-medium">Total Collectible</th>
              <th className="px-3 py-2 text-right font-medium">Collected</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              <th className="px-3 py-2 font-medium">Months idle</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {receivables.map((r) => {
              // §4 rule 9 — a negative balance (over-collection) is shown as-is, in a
              // warning color; the money is never clamped to zero.
              const negativeBalance = r.balance !== null && toMoney(r.balance).isNegative();
              return (
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
                    {r.override_review_flagged_at !== null && (
                      <span
                        className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                        title="The deal was edited after this confirmed collectible was set — review it (full banner + controls arrive with M4.4)."
                        data-testid="override-review-flag"
                      >
                        review
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPHP(r.collected_net)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      negativeBalance && "font-medium text-destructive"
                    )}
                    title={
                      negativeBalance
                        ? "Over-collected — close it or confirm the collectible."
                        : undefined
                    }
                  >
                    {r.balance === null ? "—" : formatPHP(r.balance)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.pct_collected === null ? "—" : formatRateAsPercent(r.pct_collected)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.months_idle === null ? (
                      <span className="text-xs">
                        {r.status === "open" ? "no payment yet" : "—"}
                      </span>
                    ) : (
                      r.months_idle
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{STATUS_LABEL[r.status]}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
