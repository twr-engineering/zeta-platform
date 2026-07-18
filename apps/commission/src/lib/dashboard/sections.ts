import { toMoney, ZERO, type MoneyValue } from "@/lib/money";
import type { CivilDate } from "@/lib/date/manila";
import {
  agingRows,
  chaseProjection,
  perDeveloperRollups,
  positionTotals,
  type Aging,
  type ChaseRow,
  type DeveloperRollup,
  type PositionTotals,
  type ProjectionReceivable,
} from "@/lib/receivables/projections";
import {
  dayAccuratePace,
  getAnnualTarget,
  paceFraction,
  type TargetTableRow,
} from "./target";

/**
 * M6 §3.3 — the EIGHT dashboard section read models, as PURE functions over
 * already-loaded rows. Mirrors src/lib/receivables/projections.ts exactly: no
 * database, no `today` beyond the injected civil date, no formatting — so every
 * section is unit-testable against the v30.20 fixture and the reconciliation
 * assertions the module lives or dies on are assertable in CI (aging TOTAL =
 * Balance Outstanding; Σ developer = position; Σ monthly = year collected; Dec
 * cumulative = Section 2 collected-for-year).
 *
 * WHAT IS REUSED vs NEW. Sections 1/4/5/8 reuse the M4.4 projections
 * (positionTotals / agingRows / perDeveloperRollups / chaseProjection) verbatim and
 * only DECORATE them (net cash, referral, the >30 warning). Sections 2/3/6 are new
 * aggregates over PAYMENT rows (cash & tax, collected-for-year, monthly) plus the
 * target/pace math in ./target. Section 7 (Data Health) is assembled in the server
 * layer from the existing health feeds — its shape lives in ./queries.
 *
 * YEAR FILTER SCOPE (§4 rule 1 — the rule everyone gets wrong). Only Sections 2 and
 * 6 take `dashboardYear`; Sections 1/3/4/5/8 ignore it entirely and are all-time /
 * current-state. That is enforced structurally here: the year is a parameter of
 * buildTarget and buildMonthly ALONE — no other builder can see it.
 *
 * MONEY DISCIPLINE. Every peso figure is summed at FULL precision through the Money
 * decimal type from its stored ::text string and rounded to centavos once
 * (`toFixed(2)`). No tax math anywhere — these are sums and differences of figures
 * the M1 engine and the M4/M5 consumers already computed and stored.
 */

// --- shared helpers ----------------------------------------------------------

/** Full-precision sum of a money accessor over rows, rounded to centavos once. */
function sumMoney<T>(rows: readonly T[], get: (row: T) => string | null): string {
  return rows
    .reduce<MoneyValue>((acc, row) => {
      const v = get(row);
      return v === null ? acc : acc.plus(toMoney(v));
    }, ZERO)
    .toFixed(2);
}

/** a ÷ b as an exact 6-dp rate string, or null when b = 0 (no division error). */
function ratio(a: string, b: string): string | null {
  const denom = toMoney(b);
  if (denom.isZero()) return null;
  return toMoney(a).dividedBy(denom).toFixed(6);
}

// --- the payment shape the money sections read ------------------------------

/**
 * The minimal payment projection Sections 2/3/6 consume — every field a stored
 * ::text money string or an exact integer. A full M5 PaymentRow satisfies it; a
 * test builds a partial. Only ACTIVE (non-archived) payments should be passed in;
 * the server loader filters them (listPayments default).
 */
export type DashboardPayment = {
  gross_amount: string;
  vat_amount: string;
  ewt_amount: string;
  net_cash: string;
  net_of_vat: string;
  /**
   * Calendar year the cash moved — M5's generated year_paid. Typed nullable to match
   * the generated column (it is generated-always-stored from the NOT NULL
   * payment_date, so never null in practice); a null simply matches no year filter.
   */
  year_paid: number | null;
  /** Calendar month 1–12 the cash moved, M5's generated month_paid (see year_paid). */
  month_paid: number | null;
};

/** A deal with a referral fee still owed out (from receivables/health getReferralFeesOwed). */
export type ReferralOwed = { referral_out: string };

// --- Section 1 — COLLECTION POSITION (all deals, no year filter) -------------

export type PositionSection = PositionTotals & {
  /** Σ p.net_cash over ALL active payments — cash that actually landed (§3.3). */
  netCashReceived: string;
  /** Σ d.referral_out over deals with referral_out > 0 AND referral_paid ≠ Yes. */
  referralOwed: string;
  /** How many deals make up referralOwed — the "across N deal(s)" caption. */
  referralOwedDeals: number;
};

/**
 * Section 1 — position totals (reused verbatim) decorated with Net Cash received
 * (Σ payment net_cash) and the deal-level referral-fees-owed tile (§4 rule 12 —
 * money paid OUT; it never nets against collections). Unaffected by the year filter.
 */
export function buildPosition(
  receivables: readonly ProjectionReceivable[],
  payments: readonly DashboardPayment[],
  referralOwed: readonly ReferralOwed[]
): PositionSection {
  return {
    ...positionTotals(receivables),
    netCashReceived: sumMoney(payments, (p) => p.net_cash),
    referralOwed: sumMoney(referralOwed, (d) => d.referral_out),
    referralOwedDeals: referralOwed.length,
  };
}

// --- Section 2 — COLLECTED GCI vs TARGET (dashboard year, paid basis) --------

export type TargetSection = {
  dashboardYear: number;
  /** Override → TargetTable derivation → null ("—", no error; rule 9). */
  annualTarget: string | null;
  /** The TargetTable-derived value shown beside an active override ("derived: ₱…"). */
  derivedTarget: string | null;
  /** True when annualTarget came from an AnnualTargetOverride (badge + note tip). */
  overridden: boolean;
  /** The override note, when overridden (tooltip). */
  overrideNote: string | null;
  /** Σ p.net_of_vat where year(paid) = dashboardYear. */
  collectedForYear: string;
  /** collectedForYear ÷ annualTarget, or null when target is null/0 ("—"). */
  pctOfTarget: string | null;
  /** Day-accurate pace × target, or null when target is null (line suppressed). */
  paceToDate: string | null;
  /** The clamped [0,1] pace fraction as a 6-dp string (progress bar / caption). */
  paceFraction: string;
  /** collectedForYear − paceToDate (signed), or null when target is null. */
  vsPace: string | null;
  /**
   * |vsPace| — the magnitude the "ahead/behind by ₱…" line displays (the sign is
   * carried by paceLabel, so the UI never re-derives it). Null when suppressed.
   */
  vsPaceMagnitude: string | null;
  /** "ahead" when vsPace ≥ 0, else "behind"; null when the line is suppressed. */
  paceLabel: "ahead" | "behind" | null;
};

/**
 * Section 2 — the selected year's collected GCI against the annual target, with the
 * day-accurate pace. The ONLY section (with Monthly) that reads the year filter.
 * `override` carries the AnnualTargetOverride amount + note (null when none);
 * `tableRow` is M3's TargetTable row (null until M3.2 — the derived value shows "—").
 */
export function buildTarget(
  payments: readonly DashboardPayment[],
  dashboardYear: number,
  today: CivilDate,
  override: { amount: string; note: string | null } | null,
  tableRow: TargetTableRow | null
): TargetSection {
  const overrideAmount = override?.amount ?? null;
  const annualTarget = getAnnualTarget(overrideAmount, tableRow);
  const derivedTarget = getAnnualTarget(null, tableRow);

  const collectedForYear = sumMoney(
    payments.filter((p) => p.year_paid === dashboardYear),
    (p) => p.net_of_vat
  );

  const paceToDate = dayAccuratePace(annualTarget, dashboardYear, today);
  const vsPace =
    paceToDate === null
      ? null
      : toMoney(collectedForYear).minus(toMoney(paceToDate)).toFixed(2);

  return {
    dashboardYear,
    annualTarget,
    derivedTarget,
    overridden: overrideAmount !== null,
    overrideNote: override?.note ?? null,
    collectedForYear,
    pctOfTarget: annualTarget === null ? null : ratio(collectedForYear, annualTarget),
    paceToDate,
    paceFraction: paceFraction(dashboardYear, today).toFixed(6),
    vsPace,
    vsPaceMagnitude: vsPace === null ? null : toMoney(vsPace).abs().toFixed(2),
    paceLabel: vsPace === null ? null : toMoney(vsPace).isNegative() ? "behind" : "ahead",
  };
}

// --- Section 3 — CASH & TAX BREAKDOWN (all collected, no year filter) --------

export type CashTaxSection = {
  /** Σ p.gross over all active payments. */
  gross: string;
  /** Σ p.vat — Output VAT you remit to BIR. */
  vat: string;
  /** Σ p.ewt — creditable withholding (Form 2307). */
  ewt: string;
  /** Σ p.net_cash — what hit the bank (= Gross − EWT). */
  netCash: string;
  /** Gross − VAT − EWT — retained after the VAT you owe. */
  retained: string;
};

/**
 * Section 3 — the five-line cash & tax waterfall over ALL collected payments. VAT
 * and EWT are the STORED per-payment split values summed (never recomputed — no tax
 * math here); Retained is the pure identity Gross − VAT − EWT. Ignores the year filter.
 */
export function buildCashTax(payments: readonly DashboardPayment[]): CashTaxSection {
  const gross = sumMoney(payments, (p) => p.gross_amount);
  const vat = sumMoney(payments, (p) => p.vat_amount);
  const ewt = sumMoney(payments, (p) => p.ewt_amount);
  return {
    gross,
    vat,
    ewt,
    netCash: sumMoney(payments, (p) => p.net_cash),
    retained: toMoney(gross).minus(toMoney(vat)).minus(toMoney(ewt)).toFixed(2),
  };
}

// --- Section 4 — AGING (reused verbatim) ------------------------------------

/** Section 4 — aging of open balances (M4.4 agingRows). Year-independent. */
export function buildAging(receivables: readonly ProjectionReceivable[]): Aging {
  return agingRows(receivables);
}

// --- Section 5 — RECEIVABLES BY DEVELOPER (reused verbatim) ------------------

/** Section 5 — per-developer rollups incl. the no-developer row + TOTAL (M4.4). */
export function buildByDeveloper(receivables: readonly ProjectionReceivable[]): {
  rows: DeveloperRollup[];
  total: DeveloperRollup;
} {
  return perDeveloperRollups(receivables);
}

// --- Section 6 — MONTHLY CASH-IN (dashboard year) ---------------------------

export type MonthlyRow = {
  /** 1–12. */
  month: number;
  /** Σ p.net_of_vat in (year, month). */
  collectedNet: string;
  /** Σ p.net_cash in (year, month). */
  netCash: string;
  /** # payments in the month. */
  payments: number;
  /** Running Σ collectedNet through this month. */
  cumulativeCollected: string;
  /** annualTarget × month ÷ 12, or null when there is no target ("—"). */
  cumulativeTarget: string | null;
  /** cumulativeCollected − cumulativeTarget (signed), or null when no target. */
  vsTarget: string | null;
};

export type MonthlySection = {
  dashboardYear: number;
  /** Always twelve rows (Jan–Dec); the UI renders all 12 (rule 19). */
  rows: MonthlyRow[];
};

/**
 * Section 6 — twelve month rows for the dashboard year: per-month collected/net
 * cash/# payments, a running cumulative, the straight-line cumulative target
 * (target × m ÷ 12), and the signed variance. Reads the year filter. December's
 * cumulativeCollected reconciles to Section 2's collectedForYear (same payment set).
 */
export function buildMonthly(
  payments: readonly DashboardPayment[],
  dashboardYear: number,
  annualTarget: string | null
): MonthlySection {
  const inYear = payments.filter((p) => p.year_paid === dashboardYear);
  const target = annualTarget === null ? null : toMoney(annualTarget);

  let runningCollected = ZERO;
  const rows: MonthlyRow[] = [];
  for (let month = 1; month <= 12; month++) {
    const ofMonth = inYear.filter((p) => p.month_paid === month);
    const collectedNet = sumMoney(ofMonth, (p) => p.net_of_vat);
    runningCollected = runningCollected.plus(toMoney(collectedNet));
    const cumulativeCollected = runningCollected.toFixed(2);
    const cumulativeTarget =
      target === null ? null : target.times(month).dividedBy(12).toFixed(2);

    rows.push({
      month,
      collectedNet,
      netCash: sumMoney(ofMonth, (p) => p.net_cash),
      payments: ofMonth.length,
      cumulativeCollected,
      cumulativeTarget,
      vsTarget:
        cumulativeTarget === null
          ? null
          : toMoney(cumulativeCollected).minus(toMoney(cumulativeTarget)).toFixed(2),
    });
  }

  return { dashboardYear, rows };
}

// --- Section 8 — CHASE LIST (reused verbatim + >30 warning) -----------------

export type ChaseSection = {
  rows: ChaseRow[];
  /** True when > 30 open balances — the soft "collections sprint" banner (rule 15). */
  overThirtyWarning: boolean;
};

/** The hard-coded > 30 open-balances warning threshold (rule 15 / OQ4). */
export const CHASE_WARNING_THRESHOLD = 30;

/**
 * Section 8 — the ordered open-balance chase list (M4.4 chaseProjection, Rule Q +
 * follow-up precedence) with the soft > 30 warning flag. Year-independent.
 */
export function buildChase(
  receivables: readonly ProjectionReceivable[],
  chaseIdleMonths: number
): ChaseSection {
  const rows = chaseProjection(receivables, chaseIdleMonths);
  return { rows, overThirtyWarning: rows.length > CHASE_WARNING_THRESHOLD };
}
