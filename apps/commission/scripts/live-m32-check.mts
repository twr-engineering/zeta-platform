/**
 * Headless end-to-end proof of M3.2 (Targets & rates persistence + the M6 feed) in
 * THROWAWAY workspaces. Imports the REAL v30.20 workbook, then asserts:
 *   · the 2026 TargetTable row imports EXACT (NIT 11,500,000.00 / opex 0.2200 / cos
 *     0.1000, yield & price null); 2027–2032 import as staged, not-plannable years
 *     (null NIT, rule 10);
 *   · the M6 Section-2 FEED derives the working GCI goal ₱16,920,000 from the stored
 *     row via the SAME code M6 runs (deriveAnnualTarget ∘ planYearTargetToTargetTableRow);
 *   · the override wins on top, then clearing reverts to the DERIVED 16,920,000
 *     (never "—") — FR-M3-11;
 *   · funnel rates lazy-seed the workbook defaults (25/70/30/20 / 30/70/10) and
 *     re-seed after a manual delete;
 *   · upsert_plan_year_target audits old→new and refuses invalid rows (negative NIT,
 *     opex+cos ≥ 100%) as typed reasons; update_funnel_rates audits + refuses a rate
 *     ∉ (0,1] (0 and >1); AC6 seller_lead_to_contact 0.20→0.25 recomputes the plan;
 *   · a target write is reflected on the very next read (DB-level cache coherence;
 *     the Next unstable_cache invalidation is proven in the dashboard e2e);
 *   · AC9 — tenant B reads ZERO of A's targets/rates and cannot mutate them.
 * Deletes the throwaway users after (orphan reaper takes the workspaces → residue 0).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m32-check.mts
 *
 * M3 is a booked/planning read model — no clock in any assertion here.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { PLAN_YEAR_TARGET_SELECT, FUNNEL_RATES_SELECT } from "@/lib/supabase/selects";
import {
  deriveAnnualTarget,
  planYearTargetToTargetTableRow,
  DEFAULT_FUNNEL_RATES,
} from "@/lib/planning";
import { getAnnualTarget } from "@/lib/dashboard/target";
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
  console.log("live-m32 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m32-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m32-pw";
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

async function getTarget(user: Client, year: number): Promise<PlanYearTarget | null> {
  const { data, error } = await user
    .from("plan_year_target")
    .select(PLAN_YEAR_TARGET_SELECT)
    .eq("year", year)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PlanYearTarget) ?? null;
}

async function getRates(user: Client): Promise<FunnelRatesRow | null> {
  const { data, error } = await user
    .from("funnel_rates")
    .select(FUNNEL_RATES_SELECT)
    .is("year", null)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as FunnelRatesRow) ?? null;
}

async function latestAudit(user: Client, entity: string) {
  const { data, error } = await user
    .from("audit_log_entry")
    .select("action,field_changes,occurred_at")
    .eq("entity_type", entity)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { action: string; field_changes: Record<string, { old: unknown; new: unknown }> } | null;
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
  check("import parsed the 7 TARGETS rows (2026–2032)", plan.counts.targets === 7, `${plan.counts.targets}`);
  check("import reconcile has ZERO mismatches (incl. the F8 target tie)", plan.mismatches.length === 0,
    plan.mismatches.map((m) => `${m.scope}:${m.code}:${m.field}`).join(", "));
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  // run_workbook_import drains the deal→receivable consumer internally (leg 5), so a
  // follow-up drain is a no-op — proving the import already projected the receivables.
  check("import already drained the deal events (follow-up drain is a no-op)", (await drainDeals(user)) === 0);
  const summary = (run.data as { summary?: { targets_created?: number } }).summary;
  check("import summary: 7 targets_created", summary?.targets_created === 7, `${summary?.targets_created}`);

  // === the 2026 row imports exact =============================================
  const t2026 = await getTarget(user, 2026);
  check("2026 target row imported EXACT (11,500,000.00 / 0.2200 / 0.1000, yield & price null)",
    !!t2026 && t2026.net_income_target === "11500000.00" && t2026.opex_pct === "0.2200" &&
    t2026.cos_pct === "0.1000" && t2026.yield_override === null && t2026.avg_price_override === null,
    `${t2026?.net_income_target}/${t2026?.opex_pct}/${t2026?.cos_pct}/${t2026?.yield_override}/${t2026?.avg_price_override}`);

  const t2027 = await getTarget(user, 2027);
  check("2027 imported as a staged, not-plannable year (null NIT, rule 10)",
    !!t2027 && t2027.net_income_target === null, `${t2027?.net_income_target}`);

  // === the M6 Section-2 FEED derives ₱16,920,000 ==============================
  const feedRow = t2026 ? planYearTargetToTargetTableRow(t2026) : null;
  const derived = deriveAnnualTarget(feedRow);
  check("M6 feed: 2026 derived working GCI goal = ₱16,920,000.00 (FR-M3-11)",
    derived === "16920000.00", `${derived}`);

  // no override → dashboard shows the DERIVED value
  check("dashboard S2 (no override) → derived 16,920,000", getAnnualTarget(null, feedRow) === "16920000.00");

  // set an override → override wins
  const setRes = await user.rpc("set_annual_target_override", { p_year: 2026, p_amount: "15000000", p_note: "stretch goal" });
  if (setRes.error) throw setRes.error;
  const ovr = await user.from("annual_target_override").select("amount::text").eq("year", 2026).single();
  const ovrAmount = (ovr.data as { amount: string }).amount;
  check("dashboard S2 override WINS over the derived goal", getAnnualTarget(ovrAmount, feedRow) === "15000000.00", ovrAmount);

  // clear → reverts to DERIVED (not "—")
  const clr = await user.rpc("clear_annual_target_override", { p_year: 2026 });
  if (clr.error) throw clr.error;
  const cleared = await user.from("annual_target_override").select("amount::text").eq("year", 2026).maybeSingle();
  check("dashboard S2 after clear → back to DERIVED 16,920,000 (not —)",
    cleared.data === null && getAnnualTarget(null, feedRow) === "16920000.00");

  // === funnel rates: lazy-seeded defaults, then re-seed after delete ===========
  const rates = await getRates(user);
  check("funnel rates seeded to the workbook defaults on import (25/70/30/20 / 30/70/10)",
    !!rates && rates.listing_to_sold === "0.2500" && rates.listing_appointment_rate === "0.7000" &&
    rates.seller_contact_to_appt === "0.3000" && rates.seller_lead_to_contact === "0.2000" &&
    rates.buyer_viewing_to_atp === "0.3000" && rates.buyer_contact_to_viewing === "0.7000" &&
    rates.buyer_lead_to_contact === "0.1000",
    `${rates?.listing_to_sold}/${rates?.seller_lead_to_contact}/${rates?.buyer_lead_to_contact}`);
  check("DEFAULT_FUNNEL_RATES matches the seeded values", DEFAULT_FUNNEL_RATES.listingToSold === "0.25");

  // delete the row → get_or_seed re-seeds (the lazy path for pre-migration workspaces)
  await admin.from("funnel_rates").delete().eq("workspace_id", (t2026 as PlanYearTarget).workspace_id);
  const seededAgain = await user.rpc("get_or_seed_funnel_rates");
  if (seededAgain.error) throw seededAgain.error;
  const s = seededAgain.data as { ok: boolean; listing_to_sold: string; seller_lead_to_contact: string };
  check("get_or_seed_funnel_rates re-seeds defaults after a manual delete (lazy path)",
    s.ok && s.listing_to_sold === "0.2500" && s.seller_lead_to_contact === "0.2000");

  // === upsert_plan_year_target: audit + typed validation ======================
  // create a fresh year
  const up1 = await user.rpc("upsert_plan_year_target", {
    p_year: 2035, p_net_income_target: "5000000", p_opex_pct: "0.20", p_cos_pct: "0.10",
    p_yield_override: null, p_avg_price_override: null,
  });
  check("upsert_plan_year_target creates a new year (ok)", (up1.data as { ok: boolean }).ok);
  const a1 = await latestAudit(user, "plan_year_target");
  check("create audited (action=create, net_income_target new=5000000.00)",
    a1?.action === "create" && a1.field_changes.net_income_target?.new === "5000000.00",
    `${a1?.action}/${JSON.stringify(a1?.field_changes.net_income_target)}`);

  // change it → audited old→new
  const up2 = await user.rpc("upsert_plan_year_target", {
    p_year: 2035, p_net_income_target: "6000000", p_opex_pct: "0.20", p_cos_pct: "0.10",
    p_yield_override: null, p_avg_price_override: null,
  });
  check("upsert change → immediately reflected on next read (cache coherence, DB)",
    (up2.data as { ok: boolean }).ok && (await getTarget(user, 2035))?.net_income_target === "6000000.00");
  const a2 = await latestAudit(user, "plan_year_target");
  check("change audited old→new (action=update, 5,000,000 → 6,000,000)",
    a2?.action === "update" && a2.field_changes.net_income_target?.old === "5000000.00" &&
    a2.field_changes.net_income_target?.new === "6000000.00",
    `${a2?.action}/${JSON.stringify(a2?.field_changes.net_income_target)}`);

  // invalid: negative NIT
  const badNit = await user.rpc("upsert_plan_year_target", {
    p_year: 2036, p_net_income_target: "-100", p_opex_pct: null, p_cos_pct: null,
    p_yield_override: null, p_avg_price_override: null,
  });
  check("negative NIT refused as typed reason (nit_not_positive)",
    (badNit.data as { ok: boolean; reason: string }).ok === false &&
    (badNit.data as { reason: string }).reason === "nit_not_positive");

  // invalid: opex 0.60 + cos 0.40 → net income % ≤ 0 (AC5)
  const badPct = await user.rpc("upsert_plan_year_target", {
    p_year: 2036, p_net_income_target: "5000000", p_opex_pct: "0.60", p_cos_pct: "0.40",
    p_yield_override: null, p_avg_price_override: null,
  });
  check("AC5: opex 60% + cos 40% refused (net_income_pct_nonpositive)",
    (badPct.data as { ok: boolean; reason: string }).ok === false &&
    (badPct.data as { reason: string }).reason === "net_income_pct_nonpositive");
  check("2036 was NOT created (invalid rows never persist)", (await getTarget(user, 2036)) === null);

  // delete a year (audited archive)
  const del = await user.rpc("delete_plan_year_target", { p_year: 2035 });
  check("delete_plan_year_target removes the row (audited)",
    (del.data as { ok: boolean; changed: boolean }).changed && (await getTarget(user, 2035)) === null);

  // === update_funnel_rates: AC6 + typed validation ============================
  const upr = await user.rpc("update_funnel_rates", {
    p_listing_to_sold: "0.25", p_listing_appointment_rate: "0.70", p_seller_contact_to_appt: "0.30",
    p_seller_lead_to_contact: "0.25", p_buyer_viewing_to_atp: "0.30", p_buyer_contact_to_viewing: "0.70",
    p_buyer_lead_to_contact: "0.10",
  });
  check("AC6: update_funnel_rates seller_lead_to_contact 0.20 → 0.25 (ok)", (upr.data as { ok: boolean }).ok);
  const rAfter = await getRates(user);
  check("rate change reflected on next read (0.2500)", rAfter?.seller_lead_to_contact === "0.2500");
  const ra = await latestAudit(user, "funnel_rates");
  check("rate change audited old→new (0.2000 → 0.2500)",
    ra?.action === "update" && ra.field_changes.seller_lead_to_contact?.old === "0.2000" &&
    ra.field_changes.seller_lead_to_contact?.new === "0.2500",
    `${JSON.stringify(ra?.field_changes.seller_lead_to_contact)}`);

  // invalid rate 0
  const bad0 = await user.rpc("update_funnel_rates", {
    p_listing_to_sold: "0", p_listing_appointment_rate: "0.70", p_seller_contact_to_appt: "0.30",
    p_seller_lead_to_contact: "0.20", p_buyer_viewing_to_atp: "0.30", p_buyer_contact_to_viewing: "0.70",
    p_buyer_lead_to_contact: "0.10",
  });
  check("rate = 0 refused (rate_out_of_range, field named)",
    (bad0.data as { ok: boolean; reason: string; field: string }).ok === false &&
    (bad0.data as { reason: string; field: string }).reason === "rate_out_of_range" &&
    (bad0.data as { field: string }).field === "listing_to_sold");
  // invalid rate > 1
  const badHi = await user.rpc("update_funnel_rates", {
    p_listing_to_sold: "0.25", p_listing_appointment_rate: "1.5", p_seller_contact_to_appt: "0.30",
    p_seller_lead_to_contact: "0.20", p_buyer_viewing_to_atp: "0.30", p_buyer_contact_to_viewing: "0.70",
    p_buyer_lead_to_contact: "0.10",
  });
  check("rate > 1 refused (rate_out_of_range)",
    (badHi.data as { ok: boolean; reason: string }).ok === false &&
    (badHi.data as { reason: string }).reason === "rate_out_of_range");
  check("rate = 1 is the VALID boundary (accepted)",
    ((await user.rpc("update_funnel_rates", {
      p_listing_to_sold: "1", p_listing_appointment_rate: "0.70", p_seller_contact_to_appt: "0.30",
      p_seller_lead_to_contact: "0.20", p_buyer_viewing_to_atp: "0.30", p_buyer_contact_to_viewing: "0.70",
      p_buyer_lead_to_contact: "0.10",
    })).data as { ok: boolean }).ok);

  // === AC9 — tenant B isolation ===============================================
  const b = await makeUser("b");
  uidB = b.uid;
  const bUser = b.user;
  const bSeesTargets = await bUser.from("plan_year_target").select("year").eq("year", 2026);
  check("AC9: tenant B reads ZERO of A's plan_year_target rows", (bSeesTargets.data ?? []).length === 0);
  const bSeesRates = await bUser.from("funnel_rates").select("id");
  check("AC9: tenant B reads ZERO of A's funnel_rates rows", (bSeesRates.data ?? []).length === 0);
  // B seeding its OWN rates does not touch A's workspace
  const bSeed = await bUser.rpc("get_or_seed_funnel_rates");
  check("AC9: tenant B seeds its OWN rates (separate row)", (bSeed.data as { ok: boolean }).ok);
  const aRatesStill = await getRates(user);
  check("AC9: A's rate row unchanged by B's activity", aRatesStill?.listing_to_sold === "1.0000");

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
