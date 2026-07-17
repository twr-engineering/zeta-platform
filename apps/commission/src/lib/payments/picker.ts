import type { ReceivableStatus } from "@/types/entities";

/**
 * The deal picker's option shape and its PURE type-ahead filter (FR-M5-02, §6.1).
 *
 * The picker replaces the sheet's dropdown + helper column R + cleanup Apps
 * Script: type part of a deal code or the client name and the matching deals
 * surface, each carrying the developer, receivable status and open balance so the
 * agent confirms they grabbed the right deal without leaving the form.
 *
 * WHY A PRELOADED INDEX, FILTERED HERE. The active-deal set is small (the perf
 * target is 1,000 deals — a payload the page loads once), so the type-ahead runs
 * as a pure, synchronous string match in the browser rather than a debounced
 * network round-trip per keystroke. That is what makes the < 150 ms picker target
 * (§8) trivially true and, being pure, unit-testable to the same numbers the UI
 * shows. The SPLIT preview is the deliberate server round-trip (preview.ts); the
 * picker is not — it moves no money.
 */

export type PaymentDealOption = {
  /** The FK the payment stores. */
  id: string;
  /** The permanent code (D021) — the searchable, human handle. */
  deal_code: string;
  /** `"D021 — Daria & John Salon"` (§3.1 field 2). */
  display_label: string;
  client_name: string;
  booked_year: number;
  /** The developer's current name (Developer deals) or null. */
  developer_name: string | null;
  /** The receivable's status, for the "Open · bal ₱…" hint. Null before M4 projects it. */
  receivable_status: ReceivableStatus | null;
  /** Outstanding balance as an exact string, or null (no receivable / zero-collectible). */
  balance: string | null;
};

/** Case/space-insensitive haystack for a single option. */
function haystack(option: PaymentDealOption): string {
  return `${option.deal_code} ${option.client_name} ${option.developer_name ?? ""}`.toLowerCase();
}

/**
 * Filter the preloaded active deals by a free-text query over deal code and
 * client name (developer name too, so "Abrown" finds its deals). Empty query
 * returns the whole set unchanged — the picker shows everything when first
 * opened. Matching is substring, case-insensitive, and whitespace-trimmed, so
 * "sal", "SAL", " 21 " and "daria" all find `D021 — Daria & John Salon`.
 *
 * Order is preserved from the input (the query orders it by deal_code), so the
 * caller controls sort; this only narrows.
 */
export function filterPaymentDeals(
  options: readonly PaymentDealOption[],
  query: string
): PaymentDealOption[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...options];
  // Split on whitespace so "salon 21" narrows by both tokens (AND), which is how
  // a human refines — code first, then a name fragment.
  const tokens = q.split(/\s+/);
  return options.filter((option) => {
    const hay = haystack(option);
    return tokens.every((token) => hay.includes(token));
  });
}
