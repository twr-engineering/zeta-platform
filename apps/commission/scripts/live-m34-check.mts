/**
 * Headless end-to-end proof of M3.4 (Pace vs actual + hardening) in THROWAWAY
 * workspaces. Imports the REAL v30.20 workbook, drains, then asserts Rule P12/P13:
 *   · plan_ytd_actual_sales(2026) = ₱161,680,945.00 — 17 sales ₱159,280,945 + 4 rentals
 *     ₱2,400,000, Referrer excluded (the workbook default INCLUDES rental volume, OQ-1);
 *   · plan_ytd_actual_sales(2026, include_rentals=false) = ₱159,280,945.00 (OQ-1 evidence
 *     — the ₱2,400,000 rentals delta is the one-line decision);
 *   · computePlan over the STORED 2026 target + rates + the (reality-pinned) planning
 *     basis + the LIVE ytd → Total Sales ₱415,355,587.83 / YTD ₱161,680,945.00 / Balance
 *     ₱253,674,642.83 (P11/P13, through the pure engine — arithmetic never hand-rolled);
 *   · a future plan year (2099) with zero booked deals → ₱0.00 YTD, full balance;
 *   · FR-M3-13 / AC10 — a new ₱10,000,000 2026 Sale moves YTD up by exactly that, and
 *     archiving it moves YTD back (archived deals excluded);
 *   · AC9 — tenant B's plan_ytd_actual_sales reads ZERO of A's booked volume.
 * Deletes the throwaway users after (orphan reaper takes the workspaces → residue 0).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m34-check.mts
 *
 * M3.4's YTD is a booked-year filter, not a clock read — no assertion here depends on
 * today's date (a future year reads 0 whatever the date).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { PLAN_YEAR_TARGET_SELECT, FUNNEL_RATES_SELECT } from "@/lib/supabase/selects";
import { computePlan, planYearTargetToInput, type FunnelRates } from "@/lib/planning";
import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";
import { WORKBOOK_PLANNING_BASIS } from "../tests/doubles/planning-basis";
import type { PlanYearTarget, FunnelRatesRow } from "@/types/entities";

function env() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const e: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return e;
}

const E = env();
const URL_ = E.NEXT_PUBLIC_SUPABASE_URL;
const ANON = E.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = E.SUPABASE_SERVICE_ROLE_KEY ?? E.SUPABASE_SECRET_KEY;
const FILE = "discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx";

if (!URL_ || URL_ === "PLACEHOLDER_PENDING_CREDENTIALS" || !SERVICE || !ANON) {
  console.log("live-m34 — skipped (no live Supabase credentials in .env.local).");
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
type Client = ReturnType<typeof createClient>;

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

async function makeUser(tag: string): Promise<{ uid: string; user: Client }> {
  const email = `m34-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m34-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

async function drainDeals(user: Client): Promise<number> {
  let total = 0;
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc("consume_deal_events", { p_limit: 500 });
    if (error) throw error;
    const p = (data as { processed?: number })?.processed ?? 0;
    total += p;
    if (p === 0) break;
  }
  return total;
}

async function ytd(user: Client, year: number, includeRentals = true): Promise<string> {
  const { data, error } = await user.rpc("plan_ytd_actual_sales", {
    p_year: year,
    p_include_rentals: includeRentals,
  });
  if (error) throw error;
  return (data as string) ?? "0";
}

/** Service-role insert of one engine-computed deal (AC10) — same shape as the write path. */
async function seedDeal(
  workspaceId: string,
  actor: string,
  code: string,
  input: DealComputeInput,
  settings: EngineSettings,
  refs: { propertyTypeId: string; leadSourceId: string }
): Promise<string> {
  const derived = dealDerivedDbFields(computeDeal(input, settings));
  const row = {
    workspace_id: workspaceId, deal_code: code, booked_date: "2026-06-01",
    transaction_type: input.transaction_type, deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: null, client_name: "AC10 Client", representation: input.representation,
    property_type_id: refs.propertyTypeId, lead_source_id: refs.leadSourceId,
    property_details: "AC10 synthetic sale", mode_of_payment: "cash", list_price: input.list_price,
    force_vat: input.force_vat, commission_basis: input.commission.basis,
    rate_pct: input.commission.basis === "percent" ? input.commission.rate : null,
    fixed_amount: input.commission.basis === "fixed" ? input.commission.amount : null,
    receipt_issued: input.receipt_issued, incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable, referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed, referral_paid: false,
    ...derived, booked_year: 2026, display_label: `${code} — AC10 Client`,
    version: 1, created_by: actor, updated_by: actor,
  };
  const ins = await admin.from("deal").insert(row).select("id").single();
  if (ins.error) throw new Error(`seed AC10 deal: ${ins.error.message}`);
  return (ins.data as { id: string }).id;
}

let uidA: string | null = null;
let uidB: string | null = null;

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain ---------------------------------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  check("import already drained the deal events (follow-up drain is a no-op)", (await drainDeals(user)) === 0);

  // === Rule P12 — the pace aggregate ==========================================
  const ytdInclude = await ytd(user, 2026, true);
  check("P12: YTD 2026 INCLUDING rentals = ₱161,680,945.00 (workbook default)",
    ytdInclude === "161680945.00", ytdInclude);

  const ytdExclude = await ytd(user, 2026, false);
  check("OQ-1: YTD 2026 EXCLUDING rentals = ₱159,280,945.00 (sales only, ₱2.4M delta)",
    ytdExclude === "159280945.00", ytdExclude);

  // === P11/P13 through the pure engine on the STORED row + LIVE ytd ============
  const tRow = await user
    .from("plan_year_target").select(PLAN_YEAR_TARGET_SELECT).eq("year", 2026).maybeSingle();
  if (tRow.error) throw tRow.error;
  const rRow = await user
    .from("funnel_rates").select(FUNNEL_RATES_SELECT).is("year", null).maybeSingle();
  if (rRow.error) throw rRow.error;
  const target = planYearTargetToInput(tRow.data as unknown as PlanYearTarget);
  const rr = rRow.data as unknown as FunnelRatesRow;
  const rates: FunnelRates = {
    listingToSold: rr.listing_to_sold, listingAppointmentRate: rr.listing_appointment_rate,
    sellerContactToAppt: rr.seller_contact_to_appt, sellerLeadToContact: rr.seller_lead_to_contact,
    buyerViewingToAtp: rr.buyer_viewing_to_atp, buyerContactToViewing: rr.buyer_contact_to_viewing,
    buyerLeadToContact: rr.buyer_lead_to_contact,
  };
  const result = computePlan(target, rates, WORKBOOK_PLANNING_BASIS, { ytdActualSales: ytdInclude });
  check("computePlan over the stored 2026 row is plannable", result.ok);
  if (result.ok) {
    const pace = result.plan.pace;
    check("P11: Total Sales required = ₱415,355,587.83", pace.totalSalesRequired === "415355587.83", pace.totalSalesRequired);
    check("P12: pace YTD = ₱161,680,945.00 (the live aggregate)", pace.ytdActualSales === "161680945.00", pace.ytdActualSales ?? "null");
    check("P13: Balance to target = ₱253,674,642.83 (415,355,587.83 − 161,680,945.00)",
      pace.balanceToTarget === "253674642.83", pace.balanceToTarget ?? "null");
  }

  // === zero-deal future year → 0.00, full balance =============================
  const ytdFuture = await ytd(user, 2099, true);
  check("future plan year (2099, no booked deals) → YTD ₱0.00 (booked-year filter, not a clock)",
    ytdFuture === "0", ytdFuture);
  const futureBalance = result.ok
    ? computePlan(target, rates, WORKBOOK_PLANNING_BASIS, { ytdActualSales: ytdFuture })
    : null;
  check("a zero-YTD year's balance = the whole Total Sales required (₱415,355,587.83)",
    !!futureBalance && futureBalance.ok && futureBalance.plan.pace.balanceToTarget === "415355587.83");

  // === FR-M3-13 / AC10 — a new 2026 Sale moves YTD, archiving moves it back ====
  const wsId = (tRow.data as unknown as PlanYearTarget).workspace_id;
  const pt = await admin.from("property_type").insert({ workspace_id: wsId, name: "AC10 Type", vat_rule: "threshold", created_by: a.uid }).select("id").single();
  const ls = await admin.from("lead_source").insert({ workspace_id: wsId, name: "AC10 Source", sort_order: 99, created_by: a.uid }).select("id").single();
  if (pt.error || ls.error) throw new Error("AC10 ref seed failed");
  const tax = await admin.from("tax_settings").select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered").eq("workspace_id", wsId).single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string, ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };
  const dealId = await seedDeal(wsId, a.uid, "D900001", {
    deal_type: "resale", transaction_type: "sale", representation: "buyer", force_vat: false,
    property_vat_rule: "always_exempt", list_price: "10000000.00",
    commission: { basis: "percent", rate: "0.05" }, developer_comm_base: null, receipt_issued: true,
    incentive_billed: "0.00", incentive_taxable: null, referral_out_pct: "0", referral_out_fixed: "0.00",
  }, settings, { propertyTypeId: pt.data!.id, leadSourceId: ls.data!.id });

  const ytdAfterNew = await ytd(user, 2026, true);
  check("AC10: a new ₱10,000,000 2026 Sale raises YTD to ₱171,680,945.00 (+₱10,000,000)",
    ytdAfterNew === "171680945.00", ytdAfterNew);

  await admin.from("deal").update({ archived_at: new Date().toISOString() }).eq("id", dealId);
  const ytdAfterArchive = await ytd(user, 2026, true);
  check("archived deals are EXCLUDED — archiving the deal returns YTD to ₱161,680,945.00",
    ytdAfterArchive === "161680945.00", ytdAfterArchive);
  // hard-delete the synthetic deal (childless — no payments) to leave the workbook pristine
  await admin.from("deal").delete().eq("id", dealId);

  // === AC9 — tenant B reads ZERO of A's booked volume =========================
  const b = await makeUser("b");
  uidB = b.uid;
  const bYtd = await ytd(b.user, 2026, true);
  check("AC9: tenant B's plan_ytd_actual_sales(2026) = ₱0 (reads none of A's deals)", bYtd === "0", bYtd);

  console.log(fails.length ? `\n❌ ${fails.length} FAILED: ${fails.join(", ")}` : `\n✅ ALL PASSED`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    fails.push("FATAL");
  })
  .finally(async () => {
    if (uidA) await admin.auth.admin.deleteUser(uidA);
    if (uidB) await admin.auth.admin.deleteUser(uidB);
    console.log("cleaned up throwaway users");
    process.exit(fails.length ? 1 : 0);
  });
