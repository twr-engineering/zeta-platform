import "server-only";

import { manilaToday, manilaYear, type CivilDate } from "@/lib/date/manila";
import { listReceivables } from "@/lib/receivables/queries";
import { listPayments } from "@/lib/payments/queries";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import {
  getReceivableHealth,
  type ClosedVarianceRow,
  type FullyPaidOpenRow,
  type ReferralOwedRow,
} from "@/lib/receivables/health";
import { getPaymentDataHealth } from "@/lib/payments/health";
import type { PaymentRow } from "@/lib/payments/queries";
import {
  buildAging,
  buildByDeveloper,
  buildCashTax,
  buildChase,
  buildMonthly,
  buildPosition,
  buildTarget,
  type CashTaxSection,
  type ChaseSection,
  type MonthlySection,
  type PositionSection,
  type TargetSection,
} from "./sections";
import { getAnnualTargetOverride, getTargetTableRow } from "./target-queries";
import type { Aging, DeveloperRollup } from "@/lib/receivables/projections";

/**
 * M6.1 — the server-side composer of the Collections Dashboard's eight sections.
 * The typed data contract M6.2–M6.4 (the screens) read; no UI here.
 *
 * FRESHNESS — COMPUTE-ON-READ (§8, the 60 s allowance). getDashboardData reads
 * straight through listReceivables + listPayments and hands the rows to the PURE
 * section builders in ./sections. There is no materialized cache: a payment logged
 * in M5 is visible on the very next read (0 s staleness), comfortably inside the
 * § 8 ≤ 60 s bound, and the whole 8-section read measures well under the 1.5 s
 * budget at 1,000 + 1,000 (scripts/perf-dashboard.ts). A cache would only be worth
 * its invalidation complexity if that budget were threatened — it is not, so this
 * follows the M4.4 projection-queries precedent: correctness over staleness, the
 * base read is always live. Should a later milestone need one, it layers on top and
 * invalidates on every deal/payment/deal-override event (the § 7 contract).
 *
 * YEAR FILTER (§4 rule 1). `dashboardYear` restates ONLY Sections 2 and 6; the pure
 * builders enforce that structurally (only buildTarget/buildMonthly receive the
 * year). Default = the current Asia/Manila year. `today` is injectable so pace,
 * aging, and chase chips are testable against a frozen clock (never `now()`).
 */

/** One Data Health check: the offending rows + their count (M6 §7). */
export type DataHealthCheck<Row> = { count: number; rows: Row[] };

/**
 * Section 7 — Data Health. Checks (b) fully-paid-open, (c) closed variance beyond
 * ₱0.50, (d) referral fees owed out (receivable/deal side), plus M5's stale-basis
 * payment count. `allClear` when every count is 0 — the "nothing to fix" ✓ state.
 *
 * DROPPED CHECKS (documented, so a tester does not report them missing):
 *   (a) "collections activity but no Status set" — structurally impossible: every
 *       receivable is system-created with status defaulting to Open (§4 rule 1 /
 *       receivables/health.ts). No importer path can leave it null. Not surfaced.
 *   (e)/(f) "Property Type / Developer missing from Settings" — replaced by M0
 *       referential integrity (rule 17): a referenced list item can only be
 *       archived, never deleted, so the sheet's silent VAT/Comm-Base fallbacks can
 *       never occur. Dropped as failure checks.
 */
export type DataHealthSection = {
  fullyPaidNotClosed: DataHealthCheck<FullyPaidOpenRow>;
  closedVarianceOverTolerance: DataHealthCheck<ClosedVarianceRow>;
  referralFeesOwed: DataHealthCheck<ReferralOwedRow>;
  staleBasisPayments: DataHealthCheck<PaymentRow>;
  allClear: boolean;
};

/** The full dashboard payload — all eight sections + the view meta. */
export type DashboardData = {
  meta: {
    dashboardYear: number;
    today: CivilDate;
    chaseIdleMonths: number;
  };
  position: PositionSection;
  target: TargetSection;
  cashTax: CashTaxSection;
  aging: Aging;
  byDeveloper: { rows: DeveloperRollup[]; total: DeveloperRollup };
  monthly: MonthlySection;
  dataHealth: DataHealthSection;
  chase: ChaseSection;
};

export type GetDashboardOptions = {
  /** The paid/dashboard year filtering Sections 2 & 6. Default: current Manila year. */
  dashboardYear?: number;
  /** The Manila civil date pace/aging/chase resolve against. Default: manilaToday(). */
  today?: CivilDate;
};

/**
 * Compose all eight sections in a single RLS-scoped read pass. Loads the receivable
 * ledger (idle/age overlaid live against `today`), the active payments, the health
 * feeds, the workspace chase threshold, and the year's target inputs — then hands
 * them to the pure builders. Every money figure is decimal-exact and the module's
 * reconciliations hold (aging TOTAL = Balance Outstanding; Σ developer = position;
 * Dec cumulative = Section 2 collected-for-year).
 */
export async function getDashboardData(
  options: GetDashboardOptions = {}
): Promise<DashboardData> {
  const today = options.today ?? manilaToday();
  const dashboardYear = options.dashboardYear ?? manilaYear();

  const [
    receivables,
    payments,
    context,
    receivableHealth,
    paymentHealth,
    override,
    tableRow,
  ] = await Promise.all([
    listReceivables({ today }),
    listPayments(),
    getWorkspaceContext(),
    getReceivableHealth(),
    getPaymentDataHealth(),
    getAnnualTargetOverride(dashboardYear),
    getTargetTableRow(dashboardYear),
  ]);

  const chaseIdleMonths = context?.taxSettings?.chase_idle_months ?? 3;
  const referralOwed = receivableHealth.referralFeesOwed;

  const dataHealth: DataHealthSection = {
    fullyPaidNotClosed: {
      count: receivableHealth.counts.fullyPaidNotClosed,
      rows: receivableHealth.fullyPaidNotClosed,
    },
    closedVarianceOverTolerance: {
      count: receivableHealth.counts.closedVarianceOverTolerance,
      rows: receivableHealth.closedVarianceOverTolerance,
    },
    referralFeesOwed: {
      count: receivableHealth.counts.referralFeesOwed,
      rows: referralOwed,
    },
    staleBasisPayments: {
      count: paymentHealth.counts.staleBasis,
      rows: paymentHealth.staleBasisPayments,
    },
    allClear:
      receivableHealth.counts.fullyPaidNotClosed === 0 &&
      receivableHealth.counts.closedVarianceOverTolerance === 0 &&
      receivableHealth.counts.referralFeesOwed === 0 &&
      paymentHealth.counts.staleBasis === 0,
  };

  const target = buildTarget(
    payments,
    dashboardYear,
    today,
    override ? { amount: override.amount, note: override.note } : null,
    tableRow
  );

  return {
    meta: { dashboardYear, today, chaseIdleMonths },
    position: buildPosition(receivables, payments, referralOwed),
    target,
    cashTax: buildCashTax(payments),
    aging: buildAging(receivables),
    byDeveloper: buildByDeveloper(receivables),
    monthly: buildMonthly(payments, dashboardYear, target.annualTarget),
    dataHealth,
    chase: buildChase(receivables, chaseIdleMonths),
  };
}
