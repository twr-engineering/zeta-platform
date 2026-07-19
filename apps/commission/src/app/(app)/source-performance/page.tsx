import type { Metadata } from "next";
import Link from "next/link";
import { Download, Radar, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { LegendExplainer } from "@/components/help/legend-explainer";
import {
  getSourcePerformance,
  getSourcePerformanceYears,
} from "@/lib/source-performance/queries";
import { exportPath, ROUTES } from "@/lib/routes";
import { SourceYearFilter } from "@/components/source-performance/source-year-filter";
import { SourcePerformanceTable } from "@/components/source-performance/source-performance-table";

export const metadata: Metadata = { title: "Source Performance" };

/**
 * M7.2 — Source Performance, the lead-channel scorecard (M7 §6). One screen: the blue
 * year filter, CSV/XLSX export, the verbatim sheet caption, and the eleven-column table
 * (grouped Production / Cash / Fast vs slow, pinned TOTAL, default sort Booked desc)
 * that tells the agent which channels produce money that actually ARRIVES vs money
 * stuck in pre-selling pipelines. Read-only: the year filter is the sole input, and no
 * mutation route exists on M7 (FR-M7-10).
 *
 * Every figure is the M7.1 aggregator's (getSourcePerformance) — the UI computes nothing
 * (client-side sorting reorders rows, never touches a value). The year filter is applied
 * SERVER-SIDE (FR-M7-02): `?year=` re-requests the page; default is `All` (§6). The year
 * compares deal.booked_year, never the payment year (§4 rule 1).
 */
export default async function SourcePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const raw = (await searchParams).year;
  const yearParam = Array.isArray(raw) ? raw[0] : raw;

  let yearFilter: number | "all";
  let selected: string;
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    yearFilter = Number(yearParam);
    selected = yearParam;
  } else {
    yearFilter = "all";
    selected = "all";
  }

  const [report, years] = await Promise.all([
    getSourcePerformance(yearFilter),
    getSourcePerformanceYears(),
  ]);

  const workspaceHasDeals = years.length > 0;
  const inScopeDeals = report.total.deals;
  // A URL-deep-linked year with no booked deals (the dropdown never offers one).
  const emptyYear = workspaceHasDeals && inScopeDeals === 0 && yearFilter !== "all";

  const exportQuery = yearFilter === "all" ? "" : `&year=${yearFilter}`;

  return (
    <div className="space-y-6">
      {/* header — the sole blue input (year filter) + export, sheet caption verbatim */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">Source Performance</h1>
              <LegendExplainer />
            </div>
            <p className="max-w-3xl text-sm text-pretty text-muted-foreground">
              NET GCI by lead source — earned &amp; yours (net of VAT &amp; referral-outs, EWT
              retained). Resale + Rental = fast-collecting; Developer / Pre-selling = slow pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SourceYearFilter selected={selected} years={years} />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`${exportPath("source-performance", "csv")}${exportQuery}`} />}
                data-testid="export-source-csv"
                aria-label="Export Source Performance as CSV"
              >
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`${exportPath("source-performance", "xlsx")}${exportQuery}`} />}
                data-testid="export-source-xlsx"
                aria-label="Export Source Performance as XLSX"
              >
                <Download className="size-4" /> XLSX
              </Button>
            </div>
          </div>
        </div>
      </div>

      {!workspaceHasDeals ? (
        report.rows.length === 0 ? (
          // §4 rule 6 / §6 — no lead sources configured at all.
          <EmptyState
            testId="empty-state-sources"
            icon={<Settings2 />}
            title="No lead sources configured"
            description="Deals carry a lead source; the scorecard builds from them. Add your marketing and relationship channels in Settings, then log deals against them."
            action={
              <Button nativeButton={false} render={<Link href={ROUTES.settingsLeadSources} />}>
                Configure Lead Sources
              </Button>
            }
          />
        ) : (
          // §6 — sources exist but no deals yet.
          <EmptyState
            testId="empty-state-sources"
            icon={<Radar />}
            title="No deals logged yet"
            description="Deals carry a lead source; the scorecard builds from them as deals are logged — which channels produce money that actually arrives versus money stuck in pre-selling pipelines."
            action={
              <Button nativeButton={false} render={<Link href={ROUTES.deals} />}>
                Go to the Deal Log
              </Button>
            }
          />
        )
      ) : (
        <>
          {emptyYear && (
            <p
              className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
              data-testid="empty-year-hint"
            >
              No deals booked in {selected}. Pick another year, or switch to All.
            </p>
          )}
          {!emptyYear && (
            <SourcePerformanceTable rows={report.rows} total={report.total} year={yearFilter} />
          )}
        </>
      )}
    </div>
  );
}
