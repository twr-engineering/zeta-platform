import "server-only";

/**
 * M9 — the filter-bar option sets the Search screen needs before a query runs:
 * the years present in the workspace's data (FR-M9-02) and the deal-code picker
 * index (FR-M9-03). Both are small, RLS-scoped reads that ride alongside the main
 * search on the server render — no client round-trip.
 *
 * Archived deals are INCLUDED (Rule 10): search finds them with a badge, so their
 * years and codes must be pickable too. The year list is the union of booked years
 * (Deals/Collectibles basis) and paid years (Payments basis) — one dropdown serves
 * all three tabs, the Rule-3 asymmetry lives in the *label*, not the option set.
 */
import { createClient } from "@/lib/supabase/server";

export type SearchDealOption = {
  id: string;
  dealCode: string;
  /** "D021 — Daria & John Salon" (M1 #35) — what the picker matches and shows. */
  displayLabel: string;
};

export type SearchFilterOptions = {
  /** Descending; union of booked + paid years across the workspace. */
  years: number[];
  /** Every deal code, ascending, for the exact-match type-ahead picker. */
  deals: SearchDealOption[];
};

/** 'YYYY-MM-DD' → 2026. The payment_date is a civil date string (no parsing risk). */
function yearOf(date: string): number | null {
  const y = Number(date.slice(0, 4));
  return Number.isInteger(y) && y > 0 ? y : null;
}

export async function getSearchFilterOptions(): Promise<SearchFilterOptions> {
  const supabase = await createClient();

  const [dealsRes, paymentsRes] = await Promise.all([
    supabase
      .from("deal")
      .select("id,deal_code,display_label,booked_year")
      .order("deal_code", { ascending: true })
      .returns<
        { id: string; deal_code: string; display_label: string; booked_year: number }[]
      >(),
    supabase
      .from("payment")
      .select("payment_date")
      .returns<{ payment_date: string }[]>(),
  ]);

  if (dealsRes.error) {
    throw new Error(`Could not load your deals: ${dealsRes.error.message}`);
  }
  if (paymentsRes.error) {
    throw new Error(`Could not load your payments: ${paymentsRes.error.message}`);
  }

  const years = new Set<number>();
  for (const d of dealsRes.data ?? []) {
    if (Number.isInteger(d.booked_year)) years.add(d.booked_year);
  }
  for (const p of paymentsRes.data ?? []) {
    const y = yearOf(p.payment_date);
    if (y !== null) years.add(y);
  }

  return {
    years: [...years].sort((a, b) => b - a),
    deals: (dealsRes.data ?? []).map((d) => ({
      id: d.id,
      dealCode: d.deal_code,
      displayLabel: d.display_label,
    })),
  };
}
