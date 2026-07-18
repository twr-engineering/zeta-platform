import { formatRateAsPercent, rateToPercent } from "@/lib/money";

/**
 * M3.3 — pure display helpers for the planning screen. No I/O, no React; unit-tested
 * so the screen can stay presentational. The engine (M3.1) produces every NUMBER;
 * these turn a couple of engine markers into the words the UI shows.
 */

/**
 * Where an effective assumption came from (Rule P5 / FR-M3-05). `all_time` is the
 * M2 realized basis, live as deals are logged; `override` is the per-year manual cell.
 */
export function assumptionSourceLabel(
  source: "override" | "all_time",
  year: number
): string {
  return source === "override" ? `Override for ${year}` : "All-time realized";
}

/**
 * A stored conversion rate (decimal "0.25") as the whole-percent the funnel ladder
 * shows between two stages ("25%") — PRD §6 renders conversion rates as whole percents.
 */
export function funnelRatePercentLabel(rate: string): string {
  return formatRateAsPercent(rate, 0);
}

/**
 * A stored conversion rate (decimal "0.25") as the plain number a blue rate input is
 * seeded with ("25"): the form edits whole percents and converts back to a decimal on
 * submit (the M3.2 action layer expects decimals).
 */
export function ratePercentInputValue(rate: string): string {
  return rateToPercent(rate).toString();
}
