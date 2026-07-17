import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { ReceivablesLedger } from "@/components/receivables/receivables-ledger";
import { listReceivables } from "@/lib/receivables/queries";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Collectibles" };

/**
 * The receivables ledger (M4.4) — the module's home. One receivable per deal,
 * created automatically from the deal event log; there is no create button, by
 * design (§6). The server RLS-scopes and default-sorts the rows by chase priority
 * (Rule Q); the client ledger owns filtering, the pinned totals row, the override
 * affordance, the ⚠-chase flag, export and pagination.
 *
 * The header carries the module's most-misread rule verbatim (WORKBOOK §5): Booked
 * NET GCI is an earnings figure, Total Collectible is the cash you expect in.
 */
export default async function CollectiblesPage() {
  const [receivables, context] = await Promise.all([
    listReceivables({ includeArchived: false }),
    getWorkspaceContext(),
  ]);
  const chaseIdleMonths = context?.taxSettings?.chase_idle_months ?? 3;

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
            Booked NET GCI = earned after referral-outs; Total Collectible = the full cash you expect in
            (you pay referrers separately — tracked on the Dashboard).
          </span>
        </p>
      </header>

      <ReceivablesLedger receivables={receivables} chaseIdleMonths={chaseIdleMonths} />
    </div>
  );
}
