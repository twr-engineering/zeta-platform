import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PLAN_YEAR_TARGET_SELECT } from "@/lib/supabase/selects";
import type { PlanYearTarget } from "@/types/entities";
import { DEFAULT_FUNNEL_RATES, type FunnelRates, type PlanYtdAggregate } from "./engine";

/**
 * M3.2 — server-only reads for the planning module (RLS-scoped, no workspace_id
 * filter; M0 rule 1). The M3.3 screen and M3.4 pace card read these; the M6
 * Section-2 feed has its own cached loader in @/lib/dashboard/target-queries.
 *
 * Money/rate columns come back as ::text strings (PLAN_YEAR_TARGET_SELECT /
 * FUNNEL_RATES_SELECT) — never floats.
 */

/** The PlanYearTarget row for a year, or null when none exists (rule 11). */
export async function getPlanYearTarget(
  year: number
): Promise<PlanYearTarget | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_year_target")
    .select(PLAN_YEAR_TARGET_SELECT)
    .eq("year", year)
    .maybeSingle<PlanYearTarget>();

  if (error) throw new Error(`Could not read your planning target: ${error.message}`);
  return data ?? null;
}

/** Every PlanYearTarget row (the targets-table editor + year selector, §6). */
export async function listPlanYearTargets(): Promise<PlanYearTarget[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_year_target")
    .select(PLAN_YEAR_TARGET_SELECT)
    .order("year", { ascending: true })
    .returns<PlanYearTarget[]>();

  if (error) throw new Error(`Could not read your planning targets: ${error.message}`);
  return data ?? [];
}

/** The RPC's jsonb shape — the seven rates as ::text plus the ok flag. */
type FunnelRatesRpcResult = {
  ok: boolean;
  listing_to_sold: string;
  listing_appointment_rate: string;
  seller_contact_to_appt: string;
  seller_lead_to_contact: string;
  buyer_viewing_to_atp: string;
  buyer_contact_to_viewing: string;
  buyer_lead_to_contact: string;
};

/**
 * The seven global funnel rates in the engine's FunnelRates shape (FR-M3-02),
 * seeding the workbook defaults on first read (get_or_seed_funnel_rates). Falls back
 * to the in-code DEFAULT_FUNNEL_RATES if the RPC returns nothing (it never should —
 * the RPC always seeds — but a plan must never fail to render for a missing rate row).
 */
export async function getFunnelRates(): Promise<FunnelRates> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_seed_funnel_rates");

  if (error) throw new Error(`Could not read your funnel rates: ${error.message}`);

  const r = data as unknown as FunnelRatesRpcResult | null;
  if (!r?.ok) return { ...DEFAULT_FUNNEL_RATES };

  return {
    listingToSold: r.listing_to_sold,
    listingAppointmentRate: r.listing_appointment_rate,
    sellerContactToAppt: r.seller_contact_to_appt,
    sellerLeadToContact: r.seller_lead_to_contact,
    buyerViewingToAtp: r.buyer_viewing_to_atp,
    buyerContactToViewing: r.buyer_contact_to_viewing,
    buyerLeadToContact: r.buyer_lead_to_contact,
  };
}

/**
 * M3.4 — Rule P12's YTD actual booked volume for `year`, the pace card's live figure
 * (FR-M3-08/13). Σ list_price of non-Referrer, non-archived deals booked in the plan
 * year — Sale always, Rental iff `includeRentals` (default TRUE = the workbook's sheet
 * behaviour). The engine only does the P13 subtraction; the sum happens here, in SQL
 * (plan_ytd_actual_sales), so it rides the deal index and never ships 1,000 rows to Node.
 *
 * OQ-1 lives HERE, not in the engine: `includeRentals` is the single, NOT-user-visible
 * switch the product owner's rental decision flips. Default include → 2026 reads
 * ₱161,680,945.00; exclude → ₱159,280,945.00 (the four workbook rentals, ₱2,400,000).
 *
 * The RPC sums numeric(14,2) and returns it ::text (never a JSON float); an empty year
 * comes back "0" → the engine rounds it to "0.00" and the balance is the full target.
 */
export async function getPlanYtdAggregate(
  year: number,
  { includeRentals = true }: { includeRentals?: boolean } = {}
): Promise<PlanYtdAggregate> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plan_ytd_actual_sales", {
    p_year: year,
    p_include_rentals: includeRentals,
  });

  if (error) throw new Error(`Could not read your booked sales pace: ${error.message}`);
  return { ytdActualSales: data ?? "0" };
}
