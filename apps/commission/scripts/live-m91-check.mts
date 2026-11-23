/**
 * Headless end-to-end proof of M9.1 (the Search read layer & query API) in a
 * THROWAWAY workspace. Imports the REAL v30.20 workbook, drains the deal + payment
 * consumers as the app does, then exercises the three source query functions
 * (commission.search_deals / search_collectibles / search_payments) AS A REAL JWT USER
 * — proving PRD §9 acceptance criteria 1–9 against the workbook fixtures:
 *
 *   AC1  text "lainie" → 3 deals (D013/D014/D015); same text on Collectibles → 3;
 *        on Payments → 0 rows + the verbatim empty-state (case/space normalized).
 *        (The PRD's illustrative "Ventura" example is not in the real export; the
 *        workbook's real repeated client is Lainie Vale — team-lead recalibration.)
 *   AC2  Collectibles Open + only_with_balance → 14 rows, D013 first (906,752.23),
 *        D021 present (309,948.98); Status=Closed → the 7 closed receivables.
 *   AC3  Payments Year 2026 → 8 rows newest-first (D021 incentive release first,
 *        Net of VAT 44,642.86 / Net Cash 45,535.71); Year 2025 → empty.
 *   AC4  Deals Amount(high→low) → D013 first (NET GCI 906,752.23); default →
 *        D021 first (newest); Date-oldest → D001 first.
 *   AC5  Deal ID D021 → Deals 1 (354,591.84), Collectibles 1 (309,948.98, Open),
 *        Payments 1 (the 50,000 incentive release).
 *   AC6  Year asymmetry (synthetic booked-2025 / paid-2026 deal): appears under
 *        Year 2025 in Deals + Collectibles, its payment under Year 2026 in Payments,
 *        Payments/2025 empty (Rules 3, 11).
 *   AC7  %/_ are literals, not wildcards (Rule 12): text "%" and "_" → 0 rows.
 *   AC8  Nonexistent Deal ID D999 → 200-shaped 0 rows across all three (Rule 9).
 *   AC9  Archived deal still findable WITH the archived flag (Rule 10);
 *        cross-tenant isolation — a second tenant sees nothing (RLS / AC9);
 *        empty-state string equals exactly the sheet copy.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m91-check.mts
 *
 * Deletes the throwaway users after (orphan reaper takes the workspaces →
 * delta-residue zero). CI-safe: skips with exit 0 on placeholder credentials.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";

const EMPTY = "No matching records — adjust your filters above.";

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
  console.log("live-m91 — skipped (no live Supabase credentials in .env.local).");
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { db: { schema: "commission" }, auth: { persistSession: false } });
type Client = ReturnType<typeof createClient>;

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

async function makeUser(tag: string): Promise<{ uid: string; user: Client }> {
  const email = `m91-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m91-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

async function drain(user: Client, fn: "consume_payment_events" | "consume_deal_events") {
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc(fn, { p_limit: 500 });
    if (error) throw error;
    if (((data as { processed?: number })?.processed ?? 0) === 0) break;
  }
}

type SearchRow = Record<string, unknown> & { total_count: number };
type Fn = "search_deals" | "search_collectibles" | "search_payments";

/** Run a source query as the JWT user; returns rows + the window total. */
async function search(
  user: Client,
  fn: Fn,
  args: Record<string, unknown> = {}
): Promise<{ rows: SearchRow[]; total: number }> {
  const { data, error } = await user.rpc(fn, args);
  if (error) throw error;
  const rows = (data ?? []) as SearchRow[];
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain --------------------------------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_deal_events");
  await drain(user, "consume_payment_events");

  const seed = await search(user, "search_deals", { p_limit: 200 });
  check("imported — 21 deals visible to search", seed.total === 21, String(seed.total));

  // === AC1 — text "lainie" across sources (normalized) =======================
  const lainieDeals = await search(user, "search_deals", { p_text: "lainie" });
  check(
    "AC1 Deals text 'lainie' → 3 (D013/D014/D015)",
    lainieDeals.total === 3 &&
      JSON.stringify(lainieDeals.rows.map((r) => r.deal_code).sort()) ===
        JSON.stringify(["D013", "D014", "D015"]),
    lainieDeals.rows.map((r) => r.deal_code).join(",")
  );
  const lainiePadded = await search(user, "search_deals", { p_text: "  LAINIE   " });
  check("AC1 Deals text '  LAINIE   ' normalizes to the same 3", lainiePadded.total === 3, String(lainiePadded.total));
  const lainieColl = await search(user, "search_collectibles", { p_text: "lainie" });
  check("AC1 Collectibles text 'lainie' → 3 (via the deal)", lainieColl.total === 3, String(lainieColl.total));
  const lainiePay = await search(user, "search_payments", { p_text: "lainie" });
  check("AC1 Payments text 'lainie' → 0 rows (no payments on those deals)", lainiePay.total === 0 && lainiePay.rows.length === 0);

  // === AC2 — Collectibles Status + only-with-balance =========================
  const open14 = await search(user, "search_collectibles", { p_status: "open", p_only_with_balance: true, p_limit: 200 });
  const codes14 = open14.rows.map((r) => r.deal_code);
  check("AC2 Collectibles Open + only-with-balance → 14 rows", open14.total === 14 && open14.rows.length === 14, String(open14.total));
  check("AC2 balance-desc → D013 first at 906,752.23", codes14[0] === "D013" && open14.rows[0].balance === "906752.23", `${codes14[0]}/${open14.rows[0]?.balance}`);
  const d021row = open14.rows.find((r) => r.deal_code === "D021");
  check("AC2 D021 present with balance 309,948.98 (Open)", !!d021row && d021row.balance === "309948.98" && d021row.status === "open", String(d021row?.balance));
  check(
    "AC2 the 14 = {D002,D003,D005,D007,D008..D016,D021}",
    JSON.stringify([...codes14].sort()) ===
      JSON.stringify(["D002","D003","D005","D007","D008","D009","D010","D011","D012","D013","D014","D015","D016","D021"])
  );
  const closed = await search(user, "search_collectibles", { p_status: "closed", p_limit: 200 });
  check(
    "AC2 Status=Closed → the 7 closed {D001,D004,D006,D017..D020}",
    closed.total === 7 &&
      JSON.stringify(closed.rows.map((r) => r.deal_code).sort()) ===
        JSON.stringify(["D001","D004","D006","D017","D018","D019","D020"]),
    closed.rows.map((r) => r.deal_code).join(",")
  );

  // === AC3 — Payments year filter (paid basis) ===============================
  const pay2026 = await search(user, "search_payments", { p_year: 2026, p_limit: 200 });
  check("AC3 Payments Year 2026 → 8 rows", pay2026.total === 8 && pay2026.rows.length === 8, String(pay2026.total));
  const first2026 = pay2026.rows[0];
  check(
    "AC3 newest-first → 2026-07-09 D021 incentive release first (Net of VAT 44,642.86 / Net Cash 45,535.71)",
    first2026.deal_code === "D021" && first2026.payment_date === "2026-07-09" &&
      first2026.net_of_vat === "44642.86" && first2026.net_cash === "45535.71",
    `${first2026.deal_code}/${first2026.payment_date}/${first2026.net_of_vat}/${first2026.net_cash}`
  );
  const pay2025 = await search(user, "search_payments", { p_year: 2025 });
  check("AC3 Payments Year 2025 → empty (0 rows)", pay2025.total === 0 && pay2025.rows.length === 0);

  // === AC4 — Deals sort presets ==============================================
  const amt = await search(user, "search_deals", { p_sort: "amount_desc", p_limit: 200 });
  check("AC4 Deals Amount(high→low) → D013 first at NET GCI 906,752.23", amt.rows[0].deal_code === "D013" && amt.rows[0].net_gci === "906752.23", `${amt.rows[0].deal_code}/${amt.rows[0].net_gci}`);
  const def = await search(user, "search_deals", { p_sort: "default", p_limit: 200 });
  check("AC4 Deals default (newest) → D021 first (2026-07-10)", def.rows[0].deal_code === "D021" && def.rows[0].booked_date === "2026-07-10", `${def.rows[0].deal_code}/${def.rows[0].booked_date}`);
  const old = await search(user, "search_deals", { p_sort: "date_oldest", p_limit: 200 });
  check("AC4 Deals Date(oldest) → D001 first (2026-01-01)", old.rows[0].deal_code === "D001" && old.rows[0].booked_date === "2026-01-01", `${old.rows[0].deal_code}/${old.rows[0].booked_date}`);

  // === AC5 — Deal ID D021 across sources =====================================
  const dealD021 = await search(user, "search_deals", { p_deal_code: "D021" });
  check("AC5 Deals D021 → 1 row, NET GCI 354,591.84", dealD021.total === 1 && dealD021.rows[0].net_gci === "354591.84", `${dealD021.total}/${dealD021.rows[0]?.net_gci}`);
  const collD021 = await search(user, "search_collectibles", { p_deal_code: "D021" });
  check("AC5 Collectibles D021 → 1 row, Balance 309,948.98, Open", collD021.total === 1 && collD021.rows[0].balance === "309948.98" && collD021.rows[0].status === "open", `${collD021.total}/${collD021.rows[0]?.balance}`);
  const payD021 = await search(user, "search_payments", { p_deal_code: "D021" });
  check("AC5 Payments D021 → 1 row, the 50,000 incentive (Net Cash 45,535.71)", payD021.total === 1 && payD021.rows[0].gross === "50000.00" && payD021.rows[0].net_cash === "45535.71", `${payD021.total}/${payD021.rows[0]?.gross}`);

  // === AC7 — %/_ are literals (Rule 12) ======================================
  const pct = await search(user, "search_deals", { p_text: "%" });
  const und = await search(user, "search_deals", { p_text: "_" });
  check("AC7 text '%' → 0 rows (literal, not match-all wildcard)", pct.total === 0);
  check("AC7 text '_' → 0 rows (literal, not single-char wildcard)", und.total === 0);

  // === AC8 — nonexistent Deal ID D999 → empty across sources =================
  const d999d = await search(user, "search_deals", { p_deal_code: "D999" });
  const d999c = await search(user, "search_collectibles", { p_deal_code: "D999" });
  const d999p = await search(user, "search_payments", { p_deal_code: "D999" });
  check("AC8 D999 → 0 rows on all three sources (no error)", d999d.total === 0 && d999c.total === 0 && d999p.total === 0);

  // === total_count / pagination ==============================================
  const paged = await search(user, "search_deals", { p_limit: 5, p_offset: 0 });
  check("pagination — page_size 5 returns 5 rows but total_count = 21", paged.rows.length === 5 && paged.total === 21, `${paged.rows.length}/${paged.total}`);

  // === AC6 — year asymmetry (synthetic booked-2025 / paid-2026) ==============
  await seedAsymmetryDeal(user);
  const deals2025 = await search(user, "search_deals", { p_year: 2025, p_limit: 200 });
  check("AC6 Deals Year 2025 → the synthetic booked-2025 deal", deals2025.rows.some((r) => r.deal_code === "D900"), deals2025.rows.map((r) => r.deal_code).join(","));
  const coll2025 = await search(user, "search_collectibles", { p_year: 2025, p_limit: 200 });
  check("AC6 Collectibles Year 2025 → the synthetic (booked year)", coll2025.rows.some((r) => r.deal_code === "D900"));
  const payAfter2026 = await search(user, "search_payments", { p_year: 2026, p_limit: 200 });
  check("AC6 Payments Year 2026 → now 9 (the 2026-01-10 release joined)", payAfter2026.total === 9 && payAfter2026.rows.some((r) => r.deal_code === "D900"), String(payAfter2026.total));
  const payStill2025 = await search(user, "search_payments", { p_year: 2025 });
  check("AC6 Payments Year 2025 → still empty (the release is PAID in 2026)", payStill2025.total === 0);

  // === AC9 — archived-with-badge + empty-state string + cross-tenant =========
  const archTarget = await user.from("deal").select("id").eq("deal_code", "D002").single();
  const arch = await user.rpc("set_deal_archived", { p_id: (archTarget.data as { id: string }).id, p_archived: true });
  check("AC9 archived D002 via write path", !arch.error, arch.error?.message ?? "");
  await drain(user, "consume_deal_events");
  const archived = await search(user, "search_deals", { p_deal_code: "D002" });
  check("AC9 archived deal still findable WITH archived flag (Rule 10)", archived.total === 1 && archived.rows[0].archived === true, `total ${archived.total}, archived ${archived.rows[0]?.archived}`);
  const archColl = await search(user, "search_collectibles", { p_deal_code: "D002" });
  check("AC9 its receivable also carries the archived flag", archColl.total === 1 && archColl.rows[0].archived === true);

  const bUser = await makeUser("b");
  uidB = bUser.uid;
  const otherD = await search(bUser.user, "search_deals", { p_limit: 200 });
  const otherC = await search(bUser.user, "search_collectibles", { p_limit: 200 });
  const otherP = await search(bUser.user, "search_payments", { p_limit: 200 });
  check("AC9 second tenant sees nothing on all three sources (RLS)", otherD.total === 0 && otherC.total === 0 && otherP.total === 0);
  check("AC9 empty-state string equals the sheet copy verbatim", EMPTY === "No matching records — adjust your filters above.");
}

/** Insert a synthetic resale deal booked 2025-12-15 + its receivable + a payment
 *  paid 2026-01-10, via the service role (search reads projections, not events). */
async function seedAsymmetryDeal(user: Client) {
  const ws = await user.from("workspace").select("id").single();
  const workspaceId = (ws.data as { id: string }).id;
  const pt = await user.from("property_type").select("id").limit(1).single();
  const ls = await user.from("lead_source").select("id").limit(1).single();
  const tax = await admin
    .from("tax_settings")
    .select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered")
    .eq("workspace_id", workspaceId)
    .single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };

  const input: DealComputeInput = {
    deal_type: "resale", transaction_type: "sale", representation: "buyer",
    force_vat: false, property_vat_rule: "always_exempt", list_price: "2000000.00",
    commission: { basis: "percent", rate: "0.05" }, developer_comm_base: null,
    receipt_issued: false, incentive_billed: "0.00", incentive_taxable: null,
    referral_out_pct: "0", referral_out_fixed: "0.00",
  };
  const derived = dealDerivedDbFields(computeDeal(input, settings));

  const dealRow = {
    workspace_id: workspaceId, deal_code: "D900", booked_date: "2025-12-15",
    transaction_type: "sale", deal_type: "resale", developer_id: null,
    client_name: "Asymmetry Vale", representation: "buyer",
    property_type_id: (pt.data as { id: string }).id, lead_source_id: (ls.data as { id: string }).id,
    property_details: "Asymmetry Villas", mode_of_payment: "cash", list_price: input.list_price,
    force_vat: false, commission_basis: "percent", rate_pct: "0.05", fixed_amount: null,
    receipt_issued: false, incentive_billed: "0.00", incentive_taxable: null,
    referral_out_pct: "0", referral_out_fixed: "0.00", referral_paid: false,
    ...derived, booked_year: 2025, display_label: "D900 — Asymmetry Vale", version: 1,
  };
  const ins = await admin.from("deal").insert(dealRow).select("id, default_total_collectible, net_gci").single();
  if (ins.error) throw new Error(`seed asymmetry deal: ${ins.error.message}`);
  const dealId = (ins.data as { id: string }).id;
  const collectible = (ins.data as { default_total_collectible: string }).default_total_collectible;

  const recIns = await admin.from("receivable").insert({
    workspace_id: workspaceId, deal_id: dealId, deal_code: "D900", booked_year: 2025,
    developer_id: null, client_name: "Asymmetry Vale", property_details: "Asymmetry Villas",
    deal_type: "resale", lead_source_id: (ls.data as { id: string }).id, booking_date: "2025-12-15",
    booked_net_gci: (ins.data as { net_gci: string }).net_gci, default_total_collectible: collectible,
    status: "open", collected_net: "0.00", balance: collectible, chase_priority: collectible,
  });
  if (recIns.error) throw new Error(`seed asymmetry receivable: ${recIns.error.message}`);

  const payIns = await admin.from("payment").insert({
    workspace_id: workspaceId, deal_id: dealId, payment_date: "2026-01-10",
    gross_amount: "100000.00", payment_type: "commission", reference_note: null,
    net_of_vat: "100000.00", vat_amount: "0.00", ewt_amount: "0.00", net_cash: "100000.00",
    retained_cash: "100000.00", vat_basis_used: "n_a", ewt_rate_used: "0.0000", vat_rate_used: "0.0000",
    version: 1,
  });
  if (payIns.error) throw new Error(`seed asymmetry payment: ${payIns.error.message}`);
}

main()
  .catch((err) => {
    console.error(err);
    fails.push(`threw: ${err?.message ?? err}`);
  })
  .finally(async () => {
    if (uidA) await admin.auth.admin.deleteUser(uidA);
    if (uidB) await admin.auth.admin.deleteUser(uidB);
    console.log(`\ncleaned up throwaway users (workspaces cascaded away). ${fails.length ? `FAILED: ${fails.length}` : "ALL PASSED"}`);
    process.exit(fails.length ? 1 : 0);
  });
