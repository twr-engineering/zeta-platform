import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { LegendExplainer } from "@/components/help/legend-explainer";
import { Button } from "@/components/ui/button";
import {
  ReceivablesLedger,
  type LedgerInitialFilters,
} from "@/components/receivables/receivables-ledger";
import { listReceivables } from "@/lib/receivables/queries";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { ROUTES } from "@/lib/routes";
import type { ReceivableStatus } from "@/types/entities";

export const metadata: Metadata = { title: "Collectibles" };

const AGING_BUCKETS = ["lt1", "m1to3", "m3to6", "m6plus"] as const;

/** Parse the dashboard drill-down params (FR-M6-12) into the ledger's filter seed. */
function initialFiltersFrom(params: {
  status?: string | string[];
  hasBalance?: string | string[];
  overridden?: string | string[];
  developer?: string | string[];
  bucket?: string | string[];
  overpaid?: string | string[];
  variance?: string | string[];
}): LedgerInitialFilters | undefined {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const status = one(params.status);
  const developer = one(params.developer);
  const bucket = one(params.bucket);
  const filters: LedgerInitialFilters = {};
  if (status === "open" || status === "closed" || status === "cancelled") {
    filters.status = status as ReceivableStatus;
  }
  if (one(params.hasBalance) === "true") filters.onlyWithBalance = true;
  if (one(params.overridden) === "true") filters.overriddenOnly = true;
  if (developer) filters.developer = developer;
  if (bucket && (AGING_BUCKETS as readonly string[]).includes(bucket)) {
    filters.bucket = bucket as LedgerInitialFilters["bucket"];
  }
  if (one(params.overpaid) === "true") filters.overpaidOnly = true;
  if (one(params.variance) === "over-tolerance") filters.varianceOverTolerance = true;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

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
export default async function CollectiblesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    hasBalance?: string | string[];
    overridden?: string | string[];
    developer?: string | string[];
    bucket?: string | string[];
    overpaid?: string | string[];
    variance?: string | string[];
  }>;
}) {
  const [receivables, context, params] = await Promise.all([
    listReceivables({ includeArchived: false }),
    getWorkspaceContext(),
    searchParams,
  ]);
  const chaseIdleMonths = context?.taxSettings?.chase_idle_months ?? 3;
  const initialFilters = initialFiltersFrom(params);

  if (receivables.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          testId="empty-state-receivables"
          icon={<Wallet />}
          title="Receivables create themselves — one per deal, automatically"
          description="Each deal you log gets a receivable tracking the commission you're owed against the cash you collect. Log a deal and it appears here."
          action={
            <Button nativeButton={false} render={<Link href={ROUTES.dealNew} />}>
              Log a deal
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Collectibles</h1>
          <LegendExplainer />
        </div>
        <p className="text-sm text-muted-foreground">
          One receivable per deal: what each payor owes you.{" "}
          <span className="text-muted-foreground/80">
            Booked NET GCI = earned after referral-outs; Total Collectible = the full cash you expect in
            (you pay referrers separately — tracked on the Dashboard).
          </span>
        </p>
      </header>

      <ReceivablesLedger
        receivables={receivables}
        chaseIdleMonths={chaseIdleMonths}
        initialFilters={initialFilters}
      />
    </div>
  );
}
