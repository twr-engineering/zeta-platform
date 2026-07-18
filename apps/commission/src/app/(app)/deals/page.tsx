import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus, Upload } from "lucide-react";

import { DealList } from "@/components/deals/deal-list";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { listDeals } from "@/lib/deals/queries";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Deals" };

/**
 * The deal log (FR-M1-02) — the agent's system of record for closed deals. The
 * rows are real, RLS-scoped and read with money as exact strings; the archived
 * ones ride along so the list's "Show archived" toggle needs no second query.
 * An empty workspace gets the first-deal empty state with the importer entry
 * point (§6).
 */
export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ referral?: string | string[] }>;
}) {
  const [deals, params] = await Promise.all([
    listDeals({ includeArchived: true }),
    searchParams,
  ]);
  const referralRaw = Array.isArray(params.referral) ? params.referral[0] : params.referral;
  const initialFilters =
    referralRaw === "unpaid" ? { referralUnpaid: true } : undefined;

  if (deals.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<FileText />}
          title="No deals yet — log your first closed deal"
          description="Every closed deal booked here runs through the commission and VAT engine: GCI, NET GCI, tax memos and yield. Log one by hand, or import an existing ZETA workbook."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button nativeButton={false} render={<Link href={ROUTES.dealNew} />}>
                <Plus className="size-4" /> Log a deal
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={ROUTES.dealImport} />}
                data-testid="empty-import"
              >
                <Upload className="size-4" /> Import a workbook
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="text-sm text-muted-foreground">
            Your closed deals and what each one earns.
          </p>
        </div>
        <Button
          className="hidden md:inline-flex"
          nativeButton={false}
          render={<Link href={ROUTES.dealNew} />}
          data-testid="log-deal"
        >
          <Plus className="size-4" /> Log a deal
        </Button>
      </header>

      <DealList deals={deals} initialFilters={initialFilters} />
    </div>
  );
}
