import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus, Upload } from "lucide-react";

import { DealList, type DealListInitialFilters } from "@/components/deals/deal-list";
import { EmptyState } from "@/components/common/empty-state";
import { LegendExplainer } from "@/components/help/legend-explainer";
import type { DealSegmentFilter } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { listDeals } from "@/lib/deals/queries";
import { allLeadSources } from "@/lib/settings/list-queries";
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
  searchParams: Promise<{
    referral?: string | string[];
    segment?: string | string[];
    source?: string | string[];
    year?: string | string[];
  }>;
}) {
  const [deals, params] = await Promise.all([
    listDeals({ includeArchived: true }),
    searchParams,
  ]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const referralRaw = one(params.referral);
  const segmentRaw = one(params.segment);
  const sourceRaw = one(params.source);
  const yearRaw = one(params.year);

  // Yield-Summary segment drill-through (FR-M2-12): resolve the URL segment to the
  // classifier bucket + booked year the row aggregated, so the list opens on exactly
  // those deals. Only additive — absent params leave the list's own defaults.
  const SEGMENTS: readonly DealSegmentFilter[] = ["resale", "developer", "sales", "rental", "referral"];
  const segment = SEGMENTS.find((s) => s === segmentRaw);
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : undefined;

  // Source Performance drill-through (FR-M7-09): resolve the lead_source_id to its
  // current name so the chip reads "Source: YouTube" (renames propagate). An id with
  // no matching source is ignored — the list just shows all deals. Only load the source
  // list when the param is actually present, so the common view stays a single query.
  let source: { id: string; label: string } | undefined;
  if (sourceRaw) {
    const match = (await allLeadSources()).find((s) => s.id === sourceRaw);
    if (match) source = { id: match.id, label: match.name };
  }

  const initialFilters: DealListInitialFilters | undefined =
    referralRaw === "unpaid" || segment || source || year
      ? {
          ...(referralRaw === "unpaid" ? { referralUnpaid: true } : {}),
          ...(segment ? { segment } : {}),
          ...(source ? { source } : {}),
          ...(year ? { year } : {}),
        }
      : undefined;

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
          <div className="flex items-center gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Deals</h1>
            {/* The legend "?" explainer belongs on every table/form header (rule 14);
                the cross-module sweep is M10.4 — this is the M10.1 reference surface. */}
            <LegendExplainer />
          </div>
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
