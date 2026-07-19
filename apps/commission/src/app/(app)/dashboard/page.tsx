import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/help/help-popover";
import { LegendExplainer } from "@/components/help/legend-explainer";
import { getDashboardData } from "@/lib/dashboard/queries";
import { getOnboardingState } from "@/lib/onboarding/queries";
import {
  getChecklistState,
  checklistItems,
  isChecklistVisible,
} from "@/lib/onboarding/checklist";
import { ChecklistCard } from "@/components/dashboard/checklist-card";
import {
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEP_LABELS,
  stepNumber,
} from "@/lib/onboarding/steps";
import { manilaYear } from "@/lib/date/manila";
import { ROUTES } from "@/lib/routes";
import { DashboardYearFilter } from "@/components/dashboard/dashboard-year-filter";
import { PositionSection } from "@/components/dashboard/position-section";
import { TargetSection } from "@/components/dashboard/target-section";
import { CashTaxSection } from "@/components/dashboard/cash-tax-section";
import { AgingSection } from "@/components/dashboard/aging-section";
import { ByDeveloperSection } from "@/components/dashboard/by-developer-section";
import { MonthlySection } from "@/components/dashboard/monthly-section";
import { DataHealthSection } from "@/components/dashboard/data-health-section";
import { ChaseSection } from "@/components/dashboard/chase-section";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The Collections Dashboard (M6) — the Monday-morning command center. A single
 * scrollable page in the workbook's fixed section order 1→8, driven entirely by the
 * server read model (getDashboardData; the UI never computes money — Master PRD
 * cross-cutting rule). M6.2 ships Sections 1 (Position), 2 (Collected vs Target),
 * 3 (Cash & Tax) and 6 (Monthly Cash-In); M6.3 slots in Sections 4/5/7 (aging, by
 * developer, data health); M6.4 completes the sheet with Section 8 (the chase list —
 * the working surface + the module's only write path).
 *
 * MOBILE CHASE-FIRST (§6). The DOM keeps the sheet's fixed 1→8 order (the year-scope
 * snapshot tests and the reading model depend on it), but a mobile-only jump chip in
 * the sticky header drops the field user straight onto the chase list — its Monday-
 * morning use case — in one tap.
 *
 * YEAR FILTER (§4 rule 1). `?year=` is per-user view state (default: current
 * Asia/Manila year). It restates Sections 2 and 6 ONLY — the scope is enforced
 * structurally in getDashboardData, and the sticky caption states it because it is
 * the module's most-misread rule.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const currentYear = manilaYear();
  const raw = (await searchParams).year;
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
  const dashboardYear =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : currentYear;

  // FR-M10-01: the first-run wizard auto-opens once at SIGNUP (the confirmation
  // link lands on /onboarding — see src/app/auth/confirm/route.ts), never by
  // hijacking a later dashboard visit (rule 1: never forced). Here we only read
  // the state to show the non-modal "Continue setup" resume prompt for a wizard
  // left in progress (rule 2 / AC3) — the app was fully usable in between.
  const onboarding = await getOnboardingState();

  // FR-M10-15: the getting-started checklist (event-derived, never gates). Shown
  // until dismissed; sample records never tick first-deal/first-payment (rule 10).
  const checklist = await getChecklistState();

  const data = await getDashboardData({ dashboardYear });

  // Empty workspace = no receivables at all (one is created per deal), so nothing
  // has been logged yet. Every section still renders with zeros/"—" (rule 19); the
  // banner points the agent at the first thing to do.
  const isEmpty =
    data.position.counts.open +
      data.position.counts.closed +
      data.position.counts.cancelled ===
    0;

  return (
    <div className="space-y-8">
      {/* Resume prompt (rule 2 / AC3): non-modal, dismissable, the app was fully
          usable in between. Shown only while the wizard is mid-flight. */}
      {onboarding?.status === "in_progress" && (
        <Link
          href={ROUTES.onboarding}
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
          data-testid="onboarding-resume-prompt"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">
                Continue setup (step {stepNumber(onboarding.current_step)} of {ONBOARDING_STEP_COUNT})
              </p>
              <p className="text-sm text-muted-foreground">
                You left off at {ONBOARDING_STEP_LABELS[onboarding.current_step]}. Pick up where you were — nothing was lost.
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
        </Link>
      )}

      {checklist && isChecklistVisible(checklist) && (
        <ChecklistCard items={checklistItems(checklist)} />
      )}

      {/* sticky header carrying the year filter (§6) */}
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
              <HelpPopover
                placement="dashboard.header"
                label="About this product's philosophy"
                testId="help-dashboard-header"
              />
              <LegendExplainer />
            </div>
            <p className="text-sm text-muted-foreground">
              How much you&rsquo;re owed, what&rsquo;s landed, and whether you&rsquo;re on pace.
            </p>
          </div>
          <DashboardYearFilter selectedYear={dashboardYear} currentYear={currentYear} />
        </div>
        {/* Mobile chase-first (§6): one tap to the field-use surface without reordering
            the sheet. Hidden on desktop, where the whole page is visible at once. */}
        {!isEmpty && (
          <a
            href="#chase"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline lg:hidden"
            data-testid="chase-jump"
          >
            Jump to chase list ↓
          </a>
        )}
      </div>

      {isEmpty && (
        <div
          className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between"
          data-testid="dashboard-empty"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold">
                Your position appears after your first deal; pace after your first payment
              </h2>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                Log a deal and your collection position lights up; record a release and the
                cash breakdown and pace fill in. The checklist below tracks both.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href={ROUTES.dealNew} />} data-testid="empty-log-deal">
              Log a deal
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={ROUTES.dealImport} />}
              data-testid="empty-import"
            >
              Import workbook
            </Button>
          </div>
        </div>
      )}

      <PositionSection data={data.position} />
      <TargetSection data={data.target} />
      <CashTaxSection data={data.cashTax} />

      <AgingSection data={data.aging} balanceOutstanding={data.position.balanceOutstanding} />
      <ByDeveloperSection data={data.byDeveloper} />

      <MonthlySection data={data.monthly} />

      <DataHealthSection data={data.dataHealth} />

      <ChaseSection data={data.chase} />
    </div>
  );
}
