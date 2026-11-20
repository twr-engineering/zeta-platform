import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Download, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { LegendExplainer } from "@/components/help/legend-explainer";
import { getYieldSummaryView } from "@/lib/yield/report-queries";
import { manilaYear } from "@/lib/date/manila";
import { dealDetailPath, exportPath, ROUTES } from "@/lib/routes";
import type { YearFilter } from "@/lib/yield";
import { YieldYearFilter } from "@/components/yield/yield-year-filter";
import { SegmentTable } from "@/components/yield/segment-table";
import { AvgPriceBlock } from "@/components/yield/avg-price-block";
import { PlanningBasisCard } from "@/components/yield/planning-basis-card";

export const metadata: Metadata = { title: "Yield Summary" };

/**
 * The Yield Summary (M2) — "what does the agent actually earn, per peso sold, by kind
 * of business?" A single screen at full sheet parity: the sole blue year filter, the
 * five-segment table with locked-computed values + formula tooltips, TOTAL GCI + the
 * memo pair, the average-price block, and the Planning Basis card that feeds the GCI
 * Calculator regardless of the filter (Rule 4). Every number is the server read model's
 * (getYieldSummaryView over the M2.2 materialized aggregate) — the UI computes nothing.
 *
 * YEAR FILTER (FR-M2-05): `?year=` is per-user view state; default is the current
 * Manila booked year. It scopes the table/memos/averages ONLY — the planning basis is
 * all-time. RULE 9 (FR-M2-08): the partition invariant runs on every render; any
 * unclassified deal surfaces as a data-quality banner, never a silent drop.
 */
export default async function YieldSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const currentYear = manilaYear();
  const raw = (await searchParams).year;
  const yearParam = Array.isArray(raw) ? raw[0] : raw;

  let yearFilter: YearFilter;
  let selected: string;
  if (yearParam === "all") {
    yearFilter = "all";
    selected = "all";
  } else {
    const parsed = Number(yearParam);
    const valid = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100;
    yearFilter = valid ? parsed : currentYear;
    selected = String(yearFilter);
  }

  const view = await getYieldSummaryView(yearFilter);
  const { report, planningBasis, basisVersion, yearsPresent, unclassified, hasAnyData } = view;

  const exportQuery = yearFilter === "all" ? "" : `&year=${yearFilter}`;
  const reportEmpty = report.rows.every((r) => r.deals === 0);
  const emptyYear = hasAnyData && reportEmpty && yearFilter !== "all";

  return (
    <div className="space-y-6">
      {/* header — the sole blue input (year filter) + export, sheet caption verbatim */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">Yield Summary</h1>
              <LegendExplainer />
            </div>
            <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
              Blended sales yield + blended avg sale price feed the GCI Calculator.
              Developer = pre-selling + RFO. Rental &amp; Referral separate.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <YieldYearFilter selected={selected} currentYear={currentYear} years={yearsPresent} />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`${exportPath("yield-summary", "csv")}${exportQuery}`} />}
                data-testid="export-yield-csv"
                aria-label="Export Yield Summary as CSV"
              >
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`${exportPath("yield-summary", "xlsx")}${exportQuery}`} />}
                data-testid="export-yield-xlsx"
                aria-label="Export Yield Summary as XLSX"
              >
                <Download className="size-4" /> XLSX
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Rule 9 — partition-invariant data-quality banner (FR-M2-08). Unreachable via
          the app's validated deal form (M1 couples Sale⇒{Developer,Resale}), so this
          fires only on imported/legacy data that broke the type coupling; reconcile is
          the live source. */}
      {unclassified.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          data-testid="unclassified-banner"
          role="alert"
        >
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {unclassified.length} deal{unclassified.length === 1 ? "" : "s"} unclassified — fix
            their Transaction/Deal Type in the Deal Log
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {unclassified.map((code) => (
              <Link
                key={code}
                href={dealDetailPath(code)}
                className="rounded-md border px-2 py-0.5 font-medium text-primary hover:underline"
                data-testid={`unclassified-${code}`}
              >
                {code}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!hasAnyData ? (
        <EmptyState
          testId="empty-state-yield"
          icon={<TrendingUp />}
          title="No deals yet — realized yields appear once deals are logged"
          description="Segments, blended yield and average price appear after your first Sale deal — grouped into Resale, Developer, Rental and Referral. Log a deal in the Deal Log to light this up."
          action={
            <Button nativeButton={false} render={<Link href={ROUTES.deals} />}>
              Go to the Deal Log
            </Button>
          }
        />
      ) : (
        <>
          {emptyYear && (
            <p
              className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
              data-testid="empty-year-hint"
            >
              No deals booked in {yearFilter} — the planning basis below is unaffected.
            </p>
          )}

          {/* Mobile pins the Planning Basis card first (§6); desktop keeps it after the
              report body, where it reads as the summary that feeds the calculator. */}
          <div className="flex flex-col gap-8">
            <div className="order-1 lg:order-2">
              <PlanningBasisCard planningBasis={planningBasis} basisVersion={basisVersion} />
            </div>
            <div className="order-2 space-y-8 lg:order-1">
              <SegmentTable report={report} />
              <AvgPriceBlock report={report} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
