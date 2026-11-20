import { monthsBetween, type CivilDate } from "@/lib/date/manila";
import { toMoney } from "@/lib/money";
import type { ReceivableStatus } from "@/types/entities";

/**
 * M4 Rule P (idle/age) + Rule Q (chase ordering) — the today-DEPENDENT receivable
 * math, kept pure and out of SQL.
 *
 * months_idle and age_months are functions of "today", and NO event fires as the
 * clock advances — so the consumer cannot store a value that stays correct. They
 * are computed AT READ TIME here instead (§ M4.2: "must refresh when read"),
 * against Asia/Manila via the manila helper. `today` is injected (default = the
 * caller's Manila today) so the boundary is clock-testable — the same reason the
 * payment "today" is never `now()` in SQL.
 *
 * "Whole months" = complete calendar months elapsed (DATEDIF "m"), which is exactly
 * monthsBetween: last payment 2026-07-09 → 0 on 2026-07-17, still 0 on 2026-08-08,
 * 1 on 2026-08-09.
 */

/** The fields Rule P reads off a receivable. */
export type IdleInput = {
  status: ReceivableStatus;
  last_payment_date: CivilDate | null;
  booking_date: CivilDate;
};

/**
 * Rule P — months_idle: whole months since the last payment. NULL when the
 * receivable is Closed/Cancelled (it is off the chase list) or has no payment yet
 * (the sheet shows "no payment yet"). Never negative — a future-dated payment
 * clamps to 0 (no whole month has elapsed).
 */
export function computeMonthsIdle(
  input: Pick<IdleInput, "status" | "last_payment_date">,
  today: CivilDate
): number | null {
  if (input.status !== "open") return null;
  if (!input.last_payment_date) return null;
  return Math.max(0, monthsBetween(input.last_payment_date, today));
}

/**
 * Rule P — age_months: whole months since the last payment if any, else since the
 * booking date (so a never-paid receivable still ages — the M6 aging-bucket
 * helper). NULL when Closed/Cancelled. Never negative.
 */
export function computeAgeMonths(input: IdleInput, today: CivilDate): number | null {
  if (input.status !== "open") return null;
  const from = input.last_payment_date ?? input.booking_date;
  return Math.max(0, monthsBetween(from, today));
}

/** The keys Rule Q's ordering compares. */
export type ChaseKey = {
  balance: string | null;
  months_idle: number | null;
  deal_code: string;
};

/**
 * Rule Q — the chase-priority ORDER BY contract, as a deterministic comparator
 * (M6's chase list and M4.4's ledger default sort consume this):
 *
 *   ORDER BY balance DESC, months_idle DESC NULLS LAST, deal_code ASC
 *
 * Largest balance first; ties broken by longest-idle first (nulls last — a
 * never-paid or Closed row loses the tiebreak); the permanent deal_code makes the
 * order total and stable across repeated queries. A null balance (only possible
 * before M4.2 has projected) sorts last. The DB stores chase_priority = balance to
 * back the coarse index; this comparator applies the live months_idle tiebreaker
 * the stored key cannot carry.
 */
export function compareChasePriority(a: ChaseKey, b: ChaseKey): number {
  const balCmp = compareBalanceDesc(a.balance, b.balance);
  if (balCmp !== 0) return balCmp;

  const idleCmp = compareIdleDescNullsLast(a.months_idle, b.months_idle);
  if (idleCmp !== 0) return idleCmp;

  return a.deal_code < b.deal_code ? -1 : a.deal_code > b.deal_code ? 1 : 0;
}

/** Balance DESC, decimal-exact; a null balance sorts last. */
function compareBalanceDesc(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return toMoney(b).comparedTo(toMoney(a));
}

/** months_idle DESC with NULLS LAST (independent of the DESC direction). */
function compareIdleDescNullsLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}
