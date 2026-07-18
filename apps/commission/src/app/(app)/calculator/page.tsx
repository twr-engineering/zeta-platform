import type { Metadata } from "next";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardSection } from "@/components/dashboard/section";
import { PlanningScreen } from "@/components/planning/planning-screen";
import { PlanningYearSelector } from "@/components/planning/planning-year-selector";
import { TargetsTableEditor } from "@/components/planning/targets-table-editor";
import { listPlanYearTargets, getFunnelRates } from "@/lib/planning/queries";
import { getPlanningBasis } from "@/lib/yield/planning-basis";
import { manilaYear } from "@/lib/date/manila";
import { formatAmount, rateToPercent } from "@/lib/money";
import { exportPath } from "@/lib/routes";

export const metadata: Metadata = { title: "GCI Calculator" };

/**
 * The GCI Calculator (M3) — turns a Net Income Target into a GCI goal, a deal count and
 * two prospecting funnels, then the sales volume the goal requires. One planning screen
 * per year in the workbook's reading order (economic model → assumptions → goals →
 * funnels → pace → the all-years targets editor). Every NUMBER is the pure engine's
 * (`computePlan` over the stored target + global rates + the M2 planning basis) — the UI
 * computes nothing; funnel-rate edits recompute instantly client-side and persist on
 * confirm through the gated M3.2 actions.
 *
 * `?year=` is per-user view state (default the current Manila year). The planning basis
 * (all-time realized yield + average price) links to the Yield Summary (M2).
 */
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const currentYear = manilaYear();
  const raw = (await searchParams).year;
  const yearParam = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(yearParam);
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : currentYear;

  const [targets, rates, basis] = await Promise.all([
    listPlanYearTargets(),
    getFunnelRates(),
    getPlanningBasis(),
  ]);

  const targetRow = targets.find((t) => t.year === year) ?? null;
  const yearsPresent = targets.map((t) => t.year);
  const allTimeYieldPct =
    basis.all_time_yield === null ? null : rateToPercent(basis.all_time_yield).toDecimalPlaces(4).toString();
  const allTimePricePlaceholder =
    basis.all_time_price === null ? null : formatAmount(basis.all_time_price);

  const exportQuery = `&year=${year}`;

  return (
    <div className="space-y-8">
      {/* header — the plan-year selector (blue input) + export */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">GCI Calculator</h1>
            <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
              Your annual GCI goal, deal count and prospecting funnels — linked live to your
              own realized yield and average sale price.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PlanningYearSelector selected={year} currentYear={currentYear} years={yearsPresent} />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`${exportPath("calculator-plan", "csv")}${exportQuery}`} />}
                data-testid="export-plan-csv"
                aria-label="Export the plan as CSV"
              >
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`${exportPath("calculator-plan", "xlsx")}${exportQuery}`} />}
                data-testid="export-plan-xlsx"
                aria-label="Export the plan as XLSX"
              >
                <Download className="size-4" /> XLSX
              </Button>
            </div>
          </div>
        </div>
      </div>

      <PlanningScreen key={year} year={year} targetRow={targetRow} rates={rates} basis={basis} />

      <DashboardSection
        index={6}
        title="Planning-year targets"
        description="Every year's Net Income Target and assumptions, in one place — the workbook's TargetTable."
        testId="section-targets"
      >
        <TargetsTableEditor
          targets={targets}
          allTimeYieldPct={allTimeYieldPct}
          allTimePricePlaceholder={allTimePricePlaceholder}
        />
      </DashboardSection>
    </div>
  );
}
