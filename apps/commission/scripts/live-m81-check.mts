/**
 * Headless end-to-end proof of M8.1 (the payment-period Collection Reports 1, 3, 4)
 * in a THROWAWAY workspace. Imports the REAL v30.20 workbook, drains the payment
 * consumer as the app does, then runs the SAME pure builders the app ships
 * (buildCashPerYear / buildMonthlyCashFlow / buildTaxPerMonth) over the RLS-scoped
 * payments + active booked years, and asserts every PRD §9 figure to the centavo.
 * Proves live consistency (a new payment moves report 1 on the next read) and AC9
 * cross-tenant isolation. Deletes the throwaway users after (orphan reaper takes the
 * workspaces → delta-residue zero).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m81-check.mts
 *
 * Clock-independent: reports 1/3/4 group by year(paid_date) off stored snapshots —
 * no aging/idle — so every figure is stable at any Manila date.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { PAYMENT_SELECT } from "@/lib/supabase/selects";
import {
  buildCashPerYear,
  buildMonthlyCashFlow,
  buildTaxPerMonth,
  contiguousYearRange,
  type ReportPayment,
} from "@/lib/reports/build";

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
  console.log("live-m81 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m81-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m81-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

async function drain(user: Client, fn: "consume_payment_events") {
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc(fn, { p_limit: 500 });
    if (error) throw error;
    if (((data as { processed?: number })?.processed ?? 0) === 0) break;
  }
}

/** Load the active payments the way listPayments does (stored ::text split + period). */
async function loadPayments(user: Client): Promise<ReportPayment[]> {
  const { data, error } = await user.from("payment").select(PAYMENT_SELECT).is("archived_at", null);
  if (error) throw error;
  return (data ?? []) as unknown as ReportPayment[];
}

/** The active booked years (report 1's range union input) the way the query does. */
async function loadBookedYears(user: Client): Promise<number[]> {
  const { data, error } = await user.from("deal").select("booked_year").is("archived_at", null);
  if (error) throw error;
  return (data ?? []).map((d) => (d as { booked_year: number }).booked_year);
}

async function wsOf(user: Client): Promise<string> {
  const { data } = await user.from("payment").select("workspace_id").limit(1).single();
  return (data as { workspace_id: string }).workspace_id;
}

async function dealIdOf(user: Client, code: string): Promise<string> {
  const { data } = await user.from("deal").select("id").eq("deal_code", code).single();
  return (data as { id: string }).id;
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain the payment consumer -----------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_payment_events");

  const payments = await loadPayments(user);
  const bookedYears = await loadBookedYears(user);
  check("imported 8 payments, 21 deals", payments.length === 8 && bookedYears.length === 21, `${payments.length}/${bookedYears.length}`);

  // === Report 1 — Cash Collected per Year (AC1) ===============================
  const r1 = buildCashPerYear(payments, bookedYears);
  check("R1 exactly one year row (2026)", r1.rows.length === 1 && r1.rows[0].year === 2026, String(r1.rows.length));
  const y = r1.rows[0];
  check("R1 Net of VAT 1,908,192.86", y.netOfVat === "1908192.86", y.netOfVat);
  check("R1 Net Cash 1,909,085.71", y.netCash === "1909085.71", y.netCash);
  check("R1 Output VAT 5,357.14", y.outputVat === "5357.14", y.outputVat);
  check("R1 EWT 4,464.29", y.ewt === "4464.29", y.ewt);
  check("R1 # payments 8", y.payments === 8, String(y.payments));
  check("R1 TOTAL identical to the single year", r1.total.netOfVat === "1908192.86" && r1.total.netCash === "1909085.71" && r1.total.outputVat === "5357.14" && r1.total.ewt === "4464.29" && r1.total.payments === 8);

  // === Report 3 — Monthly Cash Flow (AC4) ====================================
  const r3 = buildMonthlyCashFlow(payments, 2026);
  check("R3 twelve month rows", r3.rows.length === 12, String(r3.rows.length));
  check("R3 Jan 436,050 / 436,050", r3.rows[0].netOfVat === "436050.00" && r3.rows[0].netCash === "436050.00", `${r3.rows[0].netOfVat}/${r3.rows[0].netCash}`);
  check("R3 Jul 1,472,142.86 / 1,473,035.71", r3.rows[6].netOfVat === "1472142.86" && r3.rows[6].netCash === "1473035.71", `${r3.rows[6].netOfVat}/${r3.rows[6].netCash}`);
  check("R3 Feb–Jun & Aug–Dec are present zeros", [1, 2, 3, 4, 5, 7, 8, 9, 10, 11].every((i) => r3.rows[i].netOfVat === "0.00" && r3.rows[i].netCash === "0.00"));
  check("R3 TOTAL 1,908,192.86 / 1,909,085.71", r3.total.netOfVat === "1908192.86" && r3.total.netCash === "1909085.71", `${r3.total.netOfVat}/${r3.total.netCash}`);

  // === Report 4 — Tax Collected per Month (AC5) ==============================
  const r4 = buildTaxPerMonth(payments, 2026);
  const jan4 = r4.rows[0];
  const jul4 = r4.rows[6];
  check("R4 Jan 0 / 0 / 436,050 / 1", jan4.outputVat === "0.00" && jan4.ewt === "0.00" && jan4.netOfVatBase === "436050.00" && jan4.payments === 1, `${jan4.outputVat}/${jan4.ewt}/${jan4.netOfVatBase}/${jan4.payments}`);
  check("R4 Jul VAT 5,357.14 / EWT 4,464.29 / base 1,472,142.86 / 7", jul4.outputVat === "5357.14" && jul4.ewt === "4464.29" && jul4.netOfVatBase === "1472142.86" && jul4.payments === 7, `${jul4.outputVat}/${jul4.ewt}/${jul4.netOfVatBase}/${jul4.payments}`);
  check("R4 all other months fully zero", [1, 2, 3, 4, 5, 7, 8, 9, 10, 11].every((i) => r4.rows[i].outputVat === "0.00" && r4.rows[i].ewt === "0.00" && r4.rows[i].netOfVatBase === "0.00" && r4.rows[i].payments === 0));
  check("R4 TOTAL 5,357.14 / 4,464.29 / 1,908,192.86 / 8", r4.total.outputVat === "5357.14" && r4.total.ewt === "4464.29" && r4.total.netOfVatBase === "1908192.86" && r4.total.payments === 8);

  // === FR-M8-14 cross-checks ==================================================
  check("X R1 net-of-VAT ≡ R3 TOTAL ≡ R4 base TOTAL", y.netOfVat === r3.total.netOfVat && y.netOfVat === r4.total.netOfVatBase);

  // === Live consistency: a new 2027 payment moves report 1 on next read =======
  // Reports read the stored snapshot directly (rule 5), so an inserted payment is
  // visible immediately. Insert an untaxed ₱100,000 collection dated 2027-03-15 on
  // D010 (booked 2026) — a paid year with no booking (rule 8 / AC7).
  const ws = await wsOf(user);
  const d010 = await dealIdOf(user, "D010");
  const ins = await admin.from("payment").insert({
    workspace_id: ws,
    deal_id: d010,
    payment_date: "2027-03-15",
    gross_amount: "100000.00",
    payment_type: "commission",
    net_of_vat: "100000.00",
    vat_amount: "0.00",
    ewt_amount: "0.00",
    net_cash: "100000.00",
    retained_cash: "100000.00",
    vat_basis_used: "n_a",
    ewt_rate_used: "0",
    vat_rate_used: "0",
  });
  check("inserted a 2027 payment", !ins.error, ins.error?.message ?? "");

  const payments2 = await loadPayments(user);
  const r1b = buildCashPerYear(payments2, await loadBookedYears(user));
  check("R1 now spans 2026→2027 (contiguous, rule 2)", JSON.stringify(r1b.rows.map((r) => r.year)) === JSON.stringify([2026, 2027]), r1b.rows.map((r) => r.year).join("→"));
  const y2027 = r1b.rows.find((r) => r.year === 2027);
  check("R1 2027 row = 100,000 / 1 payment", !!y2027 && y2027.netOfVat === "100000.00" && y2027.payments === 1, `${y2027?.netOfVat}/${y2027?.payments}`);
  check("R1 TOTAL moved to 2,008,192.86 / 9 payments", r1b.total.netOfVat === "2008192.86" && r1b.total.payments === 9, `${r1b.total.netOfVat}/${r1b.total.payments}`);
  // The selectable year range extends too (rule 2/3).
  const range = contiguousYearRange([...payments2.map((p) => p.year_paid), ...(await loadBookedYears(user))]);
  check("year selector range = [2026, 2027]", JSON.stringify(range) === JSON.stringify([2026, 2027]), range.join(","));

  // === AC9 — cross-tenant isolation ==========================================
  const b = await makeUser("b");
  uidB = b.uid;
  const otherPayments = await loadPayments(b.user);
  const otherBooked = await loadBookedYears(b.user);
  const r1Other = buildCashPerYear(otherPayments, otherBooked);
  check("AC9 second tenant sees an empty report (RLS)", otherPayments.length === 0 && r1Other.rows.length === 0 && r1Other.total.payments === 0, `${otherPayments.length} payments`);
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
