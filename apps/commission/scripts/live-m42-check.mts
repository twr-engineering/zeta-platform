/**
 * Headless end-to-end proof of the M4.2 collections math in THROWAWAY workspaces.
 * Imports the REAL v30.20 workbook, drains the deal + payment consumers exactly as
 * the app does, and asserts the M1.4 PENDING anchors (Σ balance, D021, D004, dates),
 * plus incremental create/edit/delete, idempotency, replay-from-zero, negative
 * balance, and AC9 cross-tenant isolation. Deletes both throwaway users after.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m42-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { computeMonthsIdle, computeAgeMonths } from "@/lib/receivables/idle";

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
const TODAY = "2026-07-17"; // frozen "today" for idle/age assertions (workbook state)

const admin = createClient(URL_, SERVICE, { db: { schema: "commission" }, auth: { persistSession: false } });

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

type Client = ReturnType<typeof createClient>;

async function makeUser(tag: string): Promise<{ uid: string; user: Client }> {
  const email = `m42-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m42-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

// Drain a cursor-based consumer to completion (mirrors src/lib/receivables/consume.ts).
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

type Recv = {
  deal_code: string;
  status: string;
  total_collectible: string;
  collected_net: string;
  balance: string | null;
  pct_collected: string | null;
  last_payment_date: string | null;
  first_payment_date: string | null;
  days_to_first_release: number | null;
  booking_date: string;
};
const RSEL =
  "deal_code,status,total_collectible::text,collected_net::text,balance::text,pct_collected::text,last_payment_date,first_payment_date,days_to_first_release,booking_date";

async function receivables(user: Client): Promise<Recv[]> {
  const { data, error } = await user.from("receivable").select(RSEL);
  if (error) throw error;
  return (data ?? []) as unknown as Recv[];
}
function byCode(rows: Recv[], code: string): Recv {
  return rows.find((r) => r.deal_code === code)!;
}
function sumBalance(rows: Recv[]): string {
  return rows.reduce((a, r) => a + Number(r.balance ?? 0), 0).toFixed(2);
}

// An untaxed (N/A) split for a resale deal: net = gross, no VAT/EWT.
function naSplit(gross: number) {
  const g = gross.toFixed(2);
  return {
    p_net_of_vat: g,
    p_vat_amount: "0",
    p_ewt_amount: "0",
    p_net_cash: g,
    p_retained_cash: g,
    p_vat_basis_used: "n_a" as const,
    p_ewt_rate_used: "0.1000",
    p_vat_rate_used: "0.1200",
  };
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import the real workbook, drain both consumers as the app does ---------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  check("run_workbook_import ok", (run.data as { ok?: boolean })?.ok === true);

  await drain(user, "consume_deal_events"); // no-op: ran inside the import txn
  const drained = await drain(user, "consume_payment_events");
  check("payment consumer drained 8 events", drained === 8, `${drained}`);

  let rows = await receivables(user);
  check("21 receivables", rows.length === 21, `${rows.length}`);

  // --- THE M1.4 PENDING ANCHOR ------------------------------------------------
  check("Σ balance = 4,855,304.39", sumBalance(rows) === "4855304.39", sumBalance(rows));

  const d21 = byCode(rows, "D021");
  check("D021 collected = 44,642.86", d21.collected_net === "44642.86", d21.collected_net);
  check("D021 balance = 309,948.98", d21.balance === "309948.98", d21.balance ?? "null");
  check("D021 pct = 12.59% (0.125899)", d21.pct_collected === "0.125899", d21.pct_collected ?? "null");
  check("D021 days_to_first_release = -1", d21.days_to_first_release === -1, `${d21.days_to_first_release}`);
  check("D021 last/first payment = 2026-07-09", d21.last_payment_date === "2026-07-09" && d21.first_payment_date === "2026-07-09");

  const d04 = byCode(rows, "D004");
  check("D004 collected = 875,000.00", d04.collected_net === "875000.00", d04.collected_net);
  check("D004 balance = 0.00", d04.balance === "0.00", d04.balance ?? "null");
  check("D004 days_to_first_release = 115", d04.days_to_first_release === 115, `${d04.days_to_first_release}`);

  const d01 = byCode(rows, "D001");
  check("D001 days_to_first_release = 12", d01.days_to_first_release === 12, `${d01.days_to_first_release}`);

  // The 13 open, unpaid rows carry their full Total Collectible as balance.
  const openUnpaid = rows.filter((r) => r.status === "open" && r.collected_net === "0.00");
  const openUnpaidOk = openUnpaid.every((r) => r.balance === r.total_collectible);
  check("13 open-unpaid rows: balance = total_collectible", openUnpaid.length === 13 && openUnpaidOk, `${openUnpaid.length} rows`);

  // Rule P live (frozen today 2026-07-17): D021 idle 0; D008 never-paid age 3.
  check("D021 months_idle = 0 @ 2026-07-17", computeMonthsIdle({ status: "open", last_payment_date: d21.last_payment_date }, TODAY) === 0);
  const d08 = byCode(rows, "D008");
  check("D008 age_months = 3 @ 2026-07-17 (booking fallback)", computeAgeMonths({ status: "open", last_payment_date: d08.last_payment_date, booking_date: d08.booking_date }, TODAY) === 3);
  check("D008 months_idle null (no payment yet)", computeMonthsIdle({ status: "open", last_payment_date: d08.last_payment_date }, TODAY) === null);

  // Chase order (DB chase_priority column): open rows start D013 → D005 → D016 → D010.
  const chase = await user
    .from("receivable")
    .select("deal_code,chase_priority::text,status")
    .eq("status", "open")
    .order("chase_priority", { ascending: false, nullsFirst: false });
  const chaseCodes = (chase.data ?? []).map((r) => (r as { deal_code: string }).deal_code).slice(0, 4);
  check("chase order starts D013,D005,D016,D010", JSON.stringify(chaseCodes) === JSON.stringify(["D013", "D005", "D016", "D010"]), chaseCodes.join(","));

  // --- idempotency: re-drain does nothing -------------------------------------
  const reDrain = await drain(user, "consume_payment_events");
  check("re-drain is a no-op (idempotent)", reDrain === 0, `${reDrain}`);

  // --- replay from cursor 0: reset + re-drain → identical state ---------------
  await user.from("receivable_payment_cursor").update({ last_occurred_at: "-infinity", last_event_id: null }).neq("workspace_id", "00000000-0000-0000-0000-000000000000");
  const replayed = await drain(user, "consume_payment_events");
  rows = await receivables(user);
  check("replay reprocessed 8 events", replayed === 8, `${replayed}`);
  check("replay: Σ balance unchanged (no double-apply)", sumBalance(rows) === "4855304.39", sumBalance(rows));
  check("replay: still 21 receivables (no dupes)", rows.length === 21, `${rows.length}`);
  check("replay: D021 balance still 309,948.98", byCode(rows, "D021").balance === "309948.98");

  // --- incremental: create → edit → delete on D002 (untaxed resale, 126,500) --
  const d02deal = await user.from("deal").select("id").eq("deal_code", "D002").single();
  const dealId = (d02deal.data as { id: string }).id;

  // create a 100,000 Commission payment
  const created = await user.rpc("create_payment", {
    p_deal_id: dealId, p_payment_date: "2026-07-15", p_gross_amount: "100000.00",
    p_payment_type: "commission", p_reference_note: null, ...naSplit(100000),
  });
  if (created.error) throw created.error;
  const payId = (created.data as { id: string }).id;
  await drain(user, "consume_payment_events");
  let d02 = byCode(await receivables(user), "D002");
  check("create: D002 collected = 100,000.00", d02.collected_net === "100000.00", d02.collected_net);
  check("create: D002 balance = 26,500.00", d02.balance === "26500.00", d02.balance ?? "null");

  // edit gross 100,000 → 50,000 (−old +new): collected 50,000, balance 76,500
  const payVer = await user.from("payment").select("version").eq("id", payId).single();
  const edited = await user.rpc("update_payment", {
    p_id: payId, p_expected_version: (payVer.data as { version: number }).version,
    p_deal_id: dealId, p_payment_date: "2026-07-15", p_gross_amount: "50000.00",
    p_payment_type: "commission", p_reference_note: null, ...naSplit(50000),
  });
  if (edited.error) throw edited.error;
  await drain(user, "consume_payment_events");
  d02 = byCode(await receivables(user), "D002");
  check("edit: D002 collected = 50,000.00 (−old +new)", d02.collected_net === "50000.00", d02.collected_net);
  check("edit: D002 balance = 76,500.00", d02.balance === "76500.00", d02.balance ?? "null");

  // delete → reversed: collected 0, balance back to 126,500
  const payVer2 = await user.from("payment").select("version").eq("id", payId).single();
  const deleted = await user.rpc("delete_payment", { p_id: payId, p_expected_version: (payVer2.data as { version: number }).version });
  if (deleted.error) throw deleted.error;
  await drain(user, "consume_payment_events");
  d02 = byCode(await receivables(user), "D002");
  check("delete: D002 collected = 0.00 (reversed)", d02.collected_net === "0.00", d02.collected_net);
  check("delete: D002 balance = 126,500.00", d02.balance === "126500.00", d02.balance ?? "null");
  check("delete: D002 last_payment_date null again", d02.last_payment_date === null);

  // --- negative balance (over-collection) displayed, not clamped (§4 rule 9) --
  const over = await user.rpc("create_payment", {
    p_deal_id: dealId, p_payment_date: "2026-07-16", p_gross_amount: "200000.00",
    p_payment_type: "commission", p_reference_note: null, ...naSplit(200000),
  });
  if (over.error) throw over.error;
  await drain(user, "consume_payment_events");
  d02 = byCode(await receivables(user), "D002");
  check("overpay: D002 balance = -73,500.00 (negative, no clamp)", d02.balance === "-73500.00", d02.balance ?? "null");

  // --- AC9: a second tenant sees none of A's data ----------------------------
  const b = await makeUser("b");
  uidB = b.uid;
  const rB = await receivables(b.user);
  check("AC9: tenant B sees 0 receivables", rB.length === 0, `${rB.length}`);
  const drainB = await drain(b.user, "consume_payment_events");
  check("AC9: tenant B drains 0 payment events", drainB === 0, `${drainB}`);

  console.log(fails.length ? `\n❌ ${fails.length} FAILED: ${fails.join(", ")}` : "\n✅ ALL M4.2 LIVE CHECKS PASSED");
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
