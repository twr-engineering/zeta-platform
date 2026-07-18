import { toMoney } from "@/lib/money";

/**
 * M8.3 — pure display helpers shared by the report tables. Month names spelled out
 * (§6: "month names spelled out"); a zero-row test so reports 3/4's empty months
 * (rule 4) render at reduced emphasis without duplicating the check per table.
 */

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

/** True when every given money string is zero — a reduced-emphasis row (rules 2/4). */
export function allZero(...amounts: (string | null)[]): boolean {
  return amounts.every((a) => a === null || toMoney(a).isZero());
}
