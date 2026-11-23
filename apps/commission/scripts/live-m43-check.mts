/**
 * Headless end-to-end proof of M4.3 (status lifecycle, Confirmed Collectible
 * override, variance & write-off, restated-override flag, data-health) in THROWAWAY
 * workspaces. Imports the REAL v30.20 workbook, drains the consumers as the app
 * does, then exercises every M4.3 mutation against live RLS with real JWTs. Deletes
 * both throwaway users after.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m43-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { deriveDeal } from "@/lib/deals/compute";
import { dealRpcArgs } from "@/lib/deals/map";
import type { DealInput } from "@/lib/deals/schema";
import type { TaxSettings } from "@/types/entities";

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
const SERVICE = E.SUPABASE_SERVICE_ROLE_KEY;
const FILE = "discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx";

const admin = createClient(URL_, SERVICE, { db: { schema: "commission" }, auth: { persistSession: false } });

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

type Client = ReturnType<typeof createClient>;

async function makeUser(tag: string): Promise<{ uid: string; user: Client }> {
  const email = `m43-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m43-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

async function drain(user: Client, fn: "consume_deal_events" | "consume_payment_events") {
  let total = 0;
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc(fn, { p_limit: 500 });
    if (error) throw error;
    const processed = (data as { processed?: number })?.processed ?? 0;
    total += processed;
    if (processed === 0) break;
  }
  return total;
}

const RSEL =
  "id,deal_id,deal_code,status,version,total_collectible::text,default_total_collectible::text,confirmed_collectible::text,collected_net::text,balance::text,variance::text,written_off::text,override_review_flagged_at";
type Recv = {
  id: string;
  deal_id: string;
  deal_code: string;
  status: string;
  version: number;
  total_collectible: string;
  default_total_collectible: string;
  confirmed_collectible: string | null;
  collected_net: string;
  balance: string | null;
  variance: string | null;
  written_off: string | null;
  override_review_flagged_at: string | null;
};
async function recv(user: Client, code: string): Promise<Recv> {
  const { data, error } = await user.from("receivable").select(RSEL).eq("deal_code", code).single();
  if (error) throw error;
  return data as unknown as Recv;
}
function naSplit(gross: number) {
  const g = gross.toFixed(2);
  return {
    p_net_of_vat: g, p_vat_amount: "0", p_ewt_amount: "0", p_net_cash: g, p_retained_cash: g,
    p_vat_basis_used: "n_a" as const, p_ewt_rate_used: "0.1000", p_vat_rate_used: "0.1200",
  };
}

// Count audit entries for a receivable — proves a rejected mutation writes NONE.
async function auditCount(user: Client, id: string): Promise<number> {
  const { count, error } = await user
    .from("audit_log_entry")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "receivable")
    .eq("entity_id", id);
  if (error) throw error;
  return count ?? 0;
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain both consumers ------------------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_payment_events");

  // === 1) Closed fixtures: variance 0.00 (Rule N) =============================
  const closedCodes = ["D001", "D004", "D006", "D017", "D018", "D019", "D020"];
  for (const code of closedCodes) {
    const r = await recv(user, code);
    check(`${code} imported Closed, variance 0.00`, r.status === "closed" && r.variance === "0.00", `${r.status}/${r.variance}`);
  }
  {
    const r = await recv(user, "D004");
    check("D004 written_off null while Closed", r.written_off === null);
  }

  // Baseline data-health: all three checks empty on the clean import.
  const openNegBase = await user.from("receivable").select("id").eq("status", "open").is("archived_at", null).lte("balance", 0);
  check("health(b) baseline empty (no fully-paid open)", (openNegBase.data ?? []).length === 0, `${(openNegBase.data ?? []).length}`);
  const closedVarBase = await user.from("receivable").select("id").eq("status", "closed").is("archived_at", null).or("variance.gt.0.50,variance.lt.-0.50");
  check("health(c) baseline empty (no |variance|>0.50)", (closedVarBase.data ?? []).length === 0, `${(closedVarBase.data ?? []).length}`);
  const refBase = await user.from("deal").select("id").eq("referral_paid", false).gt("referral_out", 0).is("archived_at", null);
  check("health(d) baseline empty (D004 referral is Paid)", (refBase.data ?? []).length === 0, `${(refBase.data ?? []).length}`);

  // === 2) D004 reopen → recompute balance 0.00 → re-close variance 0.00 =======
  let d004 = await recv(user, "D004");
  let res = await user.rpc("reopen_receivable", { p_receivable_id: d004.id, p_expected_version: d004.version });
  check("D004 reopen ok", (res.data as { ok?: boolean })?.ok === true);
  d004 = await recv(user, "D004");
  check("D004 reopened: status open, balance 0.00, variance null", d004.status === "open" && d004.balance === "0.00" && d004.variance === null, `${d004.status}/${d004.balance}/${d004.variance}`);
  res = await user.rpc("close_receivable", { p_receivable_id: d004.id, p_expected_version: d004.version });
  check("D004 re-close variance 0.00 exact", (res.data as { variance?: string })?.variance === "0.00", `${(res.data as { variance?: string })?.variance}`);

  // === 3) Close D021 short → variance -309,948.98; reopen restores ============
  let d021 = await recv(user, "D021");
  check("D021 pre-close: open, balance 309,948.98", d021.status === "open" && d021.balance === "309948.98", `${d021.status}/${d021.balance}`);
  res = await user.rpc("close_receivable", { p_receivable_id: d021.id, p_expected_version: d021.version });
  check("D021 close variance = -309,948.98 (collected 44,642.86 − 354,591.84)", (res.data as { variance?: string })?.variance === "-309948.98", `${(res.data as { variance?: string })?.variance}`);
  d021 = await recv(user, "D021");
  check("D021 now Closed, appears in health(c)", d021.status === "closed", d021.status);
  const hcAfter = await user.from("receivable").select("deal_code").eq("status", "closed").is("archived_at", null).or("variance.gt.0.50,variance.lt.-0.50");
  check("health(c) surfaces D021 (|variance|>0.50)", (hcAfter.data ?? []).some((x) => (x as { deal_code: string }).deal_code === "D021"));
  res = await user.rpc("reopen_receivable", { p_receivable_id: d021.id, p_expected_version: d021.version });
  d021 = await recv(user, "D021");
  check("D021 reopen: variance null, balance back 309,948.98", d021.variance === null && d021.balance === "309948.98", `${d021.variance}/${d021.balance}`);

  // === 4) Cancel an open unpaid deal → full write-off (Rule O) ================
  let d005 = await recv(user, "D005"); // resale, collectible 675,000, unpaid
  check("D005 pre-cancel: open, collected 0", d005.status === "open" && d005.collected_net === "0.00");
  const cancelNoReason = await user.rpc("cancel_receivable", { p_receivable_id: d005.id, p_expected_version: d005.version, p_reason: "   " });
  check("cancel without reason → reason_required (Q20)", (cancelNoReason.data as { reason?: string })?.reason === "reason_required");
  res = await user.rpc("cancel_receivable", { p_receivable_id: d005.id, p_expected_version: d005.version, p_reason: "Buyer backed out — dead deal" });
  check("D005 cancel written_off = 675,000.00 (full collectible)", (res.data as { written_off?: string })?.written_off === "675000.00", `${(res.data as { written_off?: string })?.written_off}`);
  d005 = await recv(user, "D005");
  check("D005 Cancelled: written_off 675,000, variance null", d005.status === "cancelled" && d005.written_off === "675000.00" && d005.variance === null);
  res = await user.rpc("reopen_receivable", { p_receivable_id: d005.id, p_expected_version: d005.version });
  d005 = await recv(user, "D005");
  check("D005 reopen: written_off null, balance 675,000.00", d005.written_off === null && d005.balance === "675000.00", `${d005.written_off}/${d005.balance}`);

  // === 5) Confirmed Collectible: set/clear + note gate ========================
  let d016 = await recv(user, "D016"); // default 630,813.93
  const setNoNote = await user.rpc("set_confirmed_collectible", { p_receivable_id: d016.id, p_value: "600000.00", p_note: "" });
  check("override with no note → note_required (edge case 17)", (setNoNote.data as { reason?: string })?.reason === "note_required");
  res = await user.rpc("set_confirmed_collectible", { p_receivable_id: d016.id, p_value: "600000.00", p_note: "CLI advice: base excl. promo disc" });
  check("override set → total_collectible = 600,000.00", (res.data as { total_collectible?: string })?.total_collectible === "600000.00");
  d016 = await recv(user, "D016");
  check("override recomputes balance off the confirmed figure", d016.balance === "600000.00" && d016.confirmed_collectible === "600000.00", `${d016.balance}/${d016.confirmed_collectible}`);
  res = await user.rpc("set_confirmed_collectible", { p_receivable_id: d016.id, p_value: null, p_note: "reverting" });
  d016 = await recv(user, "D016");
  check("override cleared → back to default 630,813.93", d016.confirmed_collectible === null && d016.total_collectible === "630813.93" && d016.balance === "630813.93", `${d016.total_collectible}/${d016.balance}`);

  // === 6) Restated-override flag (§4 rule 7) via a REAL deal edit =============
  // A synthetic resale deal built with the engine (single source of money truth).
  const propType = await user.from("property_type").select("id,vat_rule").limit(1).single();
  const leadSrc = await user.from("lead_source").select("id").limit(1).single();
  const taxRow = await user.from("tax_settings").select("*").single();
  const tax = taxRow.data as unknown as TaxSettings;
  const ptId = (propType.data as { id: string }).id;
  const lsId = (leadSrc.data as { id: string }).id;
  const vatRule = (propType.data as { vat_rule: string }).vat_rule as "threshold" | "always_vat" | "always_exempt";

  function resaleInput(list: string, referralFixed = "0", referralPaid = false): DealInput {
    return {
      booked_date: "2026-07-15", transaction_type: "sale", deal_type: "resale",
      developer_id: null, client_name: "Flag Test Client", representation: "double_ended",
      property_type_id: ptId, lead_source_id: lsId, property_details: "Flag Test Unit",
      mode_of_payment: "cash", list_price: list, force_vat: false,
      commission_basis: "percent", rate_pct: "0.05", fixed_amount: null,
      receipt_issued: false, incentive_billed: "0", incentive_taxable: null,
      referral_out_pct: "0", referral_out_fixed: referralFixed, referral_paid: referralPaid,
    };
  }
  const refs = { property_vat_rule: vatRule, developer_comm_base: null };

  const inA = resaleInput("10000000"); // untaxed resale → gci 500,000 = default
  const derA = deriveDeal(inA, refs, tax);
  const created = await user.rpc("create_deal", dealRpcArgs(inA, derA) as never);
  if (created.error) throw created.error;
  const newDealId = (created.data as { id: string }).id;
  const newCode = (created.data as { deal_code: string }).deal_code;
  await drain(user, "consume_deal_events");
  let synth = await recv(user, newCode);
  check(`synthetic ${newCode}: default 500,000.00`, synth.default_total_collectible === "500000.00", synth.default_total_collectible);

  await user.rpc("set_confirmed_collectible", { p_receivable_id: synth.id, p_value: "480000.00", p_note: "confirmed different cash" });
  synth = await recv(user, newCode);
  check("override set, review flag null (fresh)", synth.confirmed_collectible === "480000.00" && synth.override_review_flagged_at === null);

  // Edit the deal's list price → default moves 500,000 → 600,000 → flag raised.
  const dealVer = await user.from("deal").select("version").eq("id", newDealId).single();
  const inB = resaleInput("12000000");
  const derB = deriveDeal(inB, refs, tax);
  const upd = await user.rpc("update_deal", { p_id: newDealId, p_expected_version: (dealVer.data as { version: number }).version, ...dealRpcArgs(inB, derB) } as never);
  if (upd.error) throw upd.error;
  await drain(user, "consume_deal_events");
  synth = await recv(user, newCode);
  check("deal edit → restated-override review flag SET", synth.override_review_flagged_at !== null, `${synth.override_review_flagged_at}`);
  check("override survives the restatement (confirmed still 480,000; total still 480,000)", synth.confirmed_collectible === "480000.00" && synth.total_collectible === "480000.00");
  check("default restated to 600,000.00 under the override", synth.default_total_collectible === "600000.00", synth.default_total_collectible);

  // clear_override_review_flag → flag null.
  await user.rpc("clear_override_review_flag", { p_receivable_id: synth.id });
  synth = await recv(user, newCode);
  check("review action clears the flag", synth.override_review_flagged_at === null);

  // Re-flag via another edit, then prove set_confirmed_collectible clears it too.
  const dealVer2 = await user.from("deal").select("version").eq("id", newDealId).single();
  const inC = resaleInput("14000000");
  const derC = deriveDeal(inC, refs, tax);
  await user.rpc("update_deal", { p_id: newDealId, p_expected_version: (dealVer2.data as { version: number }).version, ...dealRpcArgs(inC, derC) } as never);
  await drain(user, "consume_deal_events");
  synth = await recv(user, newCode);
  check("re-edit re-flags the override", synth.override_review_flagged_at !== null);
  await user.rpc("set_confirmed_collectible", { p_receivable_id: synth.id, p_value: "490000.00", p_note: "re-confirmed after edit" });
  synth = await recv(user, newCode);
  check("re-confirming the override clears the flag", synth.override_review_flagged_at === null && synth.confirmed_collectible === "490000.00");

  // === 7) Data-health constructed cases =======================================
  // (b) overpay an open deal (D002 resale 126,500) → balance ≤ 0, still open.
  const d002 = await recv(user, "D002");
  const over = await user.rpc("create_payment", { p_deal_id: d002.deal_id, p_payment_date: "2026-07-16", p_gross_amount: "150000.00", p_payment_type: "commission", p_reference_note: null, ...naSplit(150000) });
  if (over.error) throw over.error;
  await drain(user, "consume_payment_events");
  const d002b = await recv(user, "D002");
  check("(b) construct: D002 open, balance -23,500 (≤0)", d002b.status === "open" && d002b.balance === "-23500.00", `${d002b.balance}`);
  const hb = await user.from("receivable").select("deal_code").eq("status", "open").is("archived_at", null).lte("balance", 0);
  check("health(b) surfaces exactly D002", (hb.data ?? []).length === 1 && (hb.data![0] as { deal_code: string }).deal_code === "D002", `${(hb.data ?? []).map((x) => (x as { deal_code: string }).deal_code).join(",")}`);

  // (c) short-close D007 (180,000, unpaid) → variance -180,000.
  let d007 = await recv(user, "D007");
  await user.rpc("close_receivable", { p_receivable_id: d007.id, p_expected_version: d007.version });
  d007 = await recv(user, "D007");
  check("(c) construct: D007 closed variance -180,000.00", d007.variance === "-180000.00", `${d007.variance}`);

  // (d) a resale deal WITH an unpaid referral out → health(d) surfaces it.
  const inRef = resaleInput("8000000", "50000", false);
  const derRef = deriveDeal(inRef, refs, tax);
  const refDeal = await user.rpc("create_deal", dealRpcArgs(inRef, derRef) as never);
  if (refDeal.error) throw refDeal.error;
  const refCode = (refDeal.data as { deal_code: string }).deal_code;
  const hd = await user.from("deal").select("deal_code,referral_out::text,referral_paid").eq("referral_paid", false).gt("referral_out", 0).is("archived_at", null);
  check("health(d) surfaces exactly the referral deal (out 50,000, unpaid)", (hd.data ?? []).length === 1 && (hd.data![0] as { deal_code: string }).deal_code === refCode, `${(hd.data ?? []).map((x) => (x as { deal_code: string }).deal_code).join(",")}`);

  // === 8) Optimistic lock + friction gate semantics ==========================
  const d003 = await recv(user, "D003");
  const stale = await user.rpc("close_receivable", { p_receivable_id: d003.id, p_expected_version: d003.version + 5 });
  check("stale version → stale_version, no change", (stale.data as { reason?: string })?.reason === "stale_version");
  const d003after = await recv(user, "D003");
  check("stale close left status open", d003after.status === "open");
  // Reopen a still-open receivable → not_reopenable.
  const badReopen = await user.rpc("reopen_receivable", { p_receivable_id: d003.id, p_expected_version: d003.version });
  check("reopen an Open receivable → not_reopenable", (badReopen.data as { reason?: string })?.reason === "not_reopenable");

  // === 9) AC9 cross-tenant isolation on the new mutations =====================
  const b = await makeUser("b");
  uidB = b.uid;
  const rB = await b.user.from("receivable").select("id").limit(1);
  check("AC9: tenant B sees 0 of A's receivables", (rB.data ?? []).length === 0);
  const auditBefore = await auditCount(user, d003.id);
  const forged = await b.user.rpc("close_receivable", { p_receivable_id: d003.id, p_expected_version: d003.version });
  // RLS hides the row → the function raises "receivable not found" (error), or
  // returns no change; either way A's receivable is untouched and no audit is written.
  const forgedBlocked = forged.error != null || (forged.data as { ok?: boolean })?.ok !== true;
  check("AC9: tenant B cannot close A's receivable", forgedBlocked, forged.error?.message ?? JSON.stringify(forged.data));
  const d003stillOpen = await recv(user, "D003");
  const auditAfter = await auditCount(user, d003.id);
  check("AC9: A's receivable unchanged + no audit written by the forged call", d003stillOpen.status === "open" && auditAfter === auditBefore, `${d003stillOpen.status}/${auditBefore}->${auditAfter}`);

  console.log(fails.length ? `\n❌ ${fails.length} FAILED: ${fails.join(", ")}` : "\n✅ ALL M4.3 LIVE CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error("ERROR:", e?.message ?? e);
    fails.push("threw");
  })
  .finally(async () => {
    for (const uid of [uidA, uidB]) {
      if (uid) await admin.auth.admin.deleteUser(uid);
    }
    console.log("cleaned up throwaway users (workspaces cascaded away)");
    process.exit(fails.length ? 1 : 0);
  });
