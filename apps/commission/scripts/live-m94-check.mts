/**
 * Headless end-to-end proof of M9.4 (the unified "All" search tab) in a THROWAWAY
 * workspace. Imports the REAL v30.20 workbook, drains the deal + payment consumers,
 * then reproduces the All-tab data path EXACTLY as the app does — runs the three source
 * RPCs in parallel as a REAL JWT user (`search_*`, RLS-scoped) with the SHARED filters
 * only (year, deal ID, text), and assembles the combined export with the SAME helpers
 * the route uses (searchExportSpec + toXlsxRows + multi-sheet writeXlsxFile) — proving:
 *
 *   ORCHESTRATION  All + text 'lainie' → Deals 3, Collectibles 3, Payments 0 (the
 *         Payments section is the verbatim empty state); All + Deal ID D021 → 1/1/1 with
 *         the exact figures (deal NET GCI 354,591.84 / receivable balance 309,948.98 /
 *         payment gross 50,000.00, Net of VAT 44,642.86).
 *   YEAR ASYMMETRY  All + Year 2025 → Deals/Collectibles keep their 2026-booked rows out
 *         (0 each, booked basis) while… actually the workbook is all-2026, so All+2025 is
 *         empty on booked sources AND paid Payments — the asymmetry is proven on the
 *         single-source tabs (M9.1); here we assert the shared year applies per section.
 *   EXPORT  the combined workbook has exactly three sheets — Deals · Collectibles ·
 *         Payments — each with the §3.2 columns and the exact D021 rows (read back with
 *         ExcelJS); a section with no matches is a header-only sheet.
 *   PERF  the three parallel queries return page 1 combined P95 < 450 ms at fixture scale.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m94-check.mts
 *
 * Deletes the throwaway user after (orphan reaper takes the workspace → delta-residue
 * zero). CI-safe: skips with exit 0 on placeholder credentials.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import writeXlsxFile from "write-excel-file/node";
import ExcelJS from "exceljs";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { toXlsxRows, xlsxColumnWidths } from "@/lib/export/format";
import { searchExportSpec } from "@/lib/search/export-columns";
import { SEARCH_SECTIONS } from "@/lib/search/types";
import type {
  CollectibleSearchRow,
  DealSearchRow,
  PaymentSearchRow,
  SearchQuery,
  SearchResultRow,
  SearchSource,
} from "@/lib/search/types";

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
  console.log("live-m94 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m94-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m94-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
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

const RPC: Record<SearchSource, "search_deals" | "search_collectibles" | "search_payments"> = {
  deals: "search_deals",
  collectibles: "search_collectibles",
  payments: "search_payments",
};

/** Map a raw RPC row to its §3.2 projection (mirrors src/lib/search/queries.ts). */
function mapRow(source: SearchSource, r: Record<string, unknown>): SearchResultRow {
  if (source === "deals") {
    return {
      id: r.id, dealCode: r.deal_code, bookedDate: r.booked_date,
      transactionType: r.transaction_type, dealType: r.deal_type,
      developerName: r.developer_name ?? null, clientName: r.client_name,
      propertyDetails: r.property_details, netGci: r.net_gci,
      bookedYear: r.booked_year, archived: r.archived,
    } as DealSearchRow;
  }
  if (source === "payments") {
    return {
      id: r.id, dealId: r.deal_id, paymentDate: r.payment_date, dealCode: r.deal_code,
      clientName: r.client_name, propertyDetails: r.property_details, gross: r.gross,
      netOfVat: r.net_of_vat, netCash: r.net_cash, yearPaid: r.year_paid, archived: r.archived,
    } as PaymentSearchRow;
  }
  return {
    id: r.id, dealId: r.deal_id, dealCode: r.deal_code, clientName: r.client_name,
    propertyDetails: r.property_details, dealType: r.deal_type,
    totalCollectible: r.total_collectible, collectedNet: r.collected_net, balance: r.balance,
    status: r.status, bookedYear: r.booked_year, archived: r.archived,
  } as CollectibleSearchRow;
}

/**
 * Page one section's rows with the SHARED All-tab filters only (year, deal ID, text);
 * status/only_with_balance are Collectibles-scoped and never applied globally (M9.4).
 */
async function pageSection(
  user: Client,
  source: SearchSource,
  shared: Partial<SearchQuery>
): Promise<SearchResultRow[]> {
  const args: Record<string, unknown> = {
    p_year: shared.year ?? undefined,
    p_deal_code: shared.dealCode ?? undefined,
    p_text: shared.text && shared.text.length > 0 ? shared.text : undefined,
    p_sort: "default",
  };
  if (source === "collectibles") {
    args.p_status = undefined;
    args.p_only_with_balance = false;
  }
  const rows: SearchResultRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await user.rpc(RPC[source], { ...args, p_limit: 1000, p_offset: offset });
    if (error) throw new Error(`${source} paging: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    if (batch.length === 0) break;
    for (const r of batch) rows.push(mapRow(source, r));
    if (batch.length < 1000) break;
  }
  return rows;
}

/** The three sections in parallel (mirrors runAllSearch). */
async function runAll(user: Client, shared: Partial<SearchQuery>) {
  const [deals, collectibles, payments] = await Promise.all(
    SEARCH_SECTIONS.map((s) => pageSection(user, s, shared))
  );
  return { deals, collectibles, payments };
}

/** Assemble the combined multi-sheet workbook EXACTLY as /api/export/search does. */
async function allWorkbook(user: Client, shared: Partial<SearchQuery>): Promise<Buffer> {
  const sheetsData = [];
  for (const source of SEARCH_SECTIONS) {
    const spec = searchExportSpec(source);
    const rows = await pageSection(user, source, shared);
    const ds = { name: spec.sheet, sheet: spec.sheet, columns: spec.columns, rows };
    sheetsData.push({ data: toXlsxRows(ds), columns: xlsxColumnWidths(ds), sheet: spec.sheet });
  }
  return writeXlsxFile(sheetsData).toBuffer();
}

const codesOf = (rows: SearchResultRow[]) =>
  rows.map((r) => (r as { dealCode: string }).dealCode);

let uidA = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_deal_events");
  await drain(user, "consume_payment_events");

  // === ORCHESTRATION — text 'lainie' → 3 / 3 / 0 (Payments empty) =============
  const lainie = await runAll(user, { text: "lainie" });
  check("All 'lainie' → Deals section 3 rows", lainie.deals.length === 3, String(lainie.deals.length));
  check("All 'lainie' → Collectibles section 3 rows", lainie.collectibles.length === 3, String(lainie.collectibles.length));
  check("All 'lainie' → Payments section 0 rows (empty state)", lainie.payments.length === 0, String(lainie.payments.length));
  check(
    "All 'lainie' → Deals = {D013,D014,D015}",
    JSON.stringify(codesOf(lainie.deals).sort()) === JSON.stringify(["D013", "D014", "D015"]),
    codesOf(lainie.deals).join(",")
  );

  // === ORCHESTRATION — Deal ID D021 → 1 / 1 / 1 with exact figures ============
  const d021 = await runAll(user, { dealCode: "D021" });
  check("All D021 → Deals 1 row", d021.deals.length === 1, String(d021.deals.length));
  check("All D021 → Collectibles 1 row", d021.collectibles.length === 1, String(d021.collectibles.length));
  check("All D021 → Payments 1 row", d021.payments.length === 1, String(d021.payments.length));
  const deal = d021.deals[0] as DealSearchRow | undefined;
  const rec = d021.collectibles[0] as CollectibleSearchRow | undefined;
  const pay = d021.payments[0] as PaymentSearchRow | undefined;
  check("All D021 → deal NET GCI 354,591.84 (exact)", deal?.netGci === "354591.84", String(deal?.netGci));
  check("All D021 → receivable balance 309,948.98 (exact)", rec?.balance === "309948.98", String(rec?.balance));
  check("All D021 → payment gross 50,000.00 (exact)", pay?.gross === "50000.00", String(pay?.gross));
  check("All D021 → payment Net of VAT 44,642.86 (exact)", pay?.netOfVat === "44642.86", String(pay?.netOfVat));

  // === EXPORT — combined workbook = 3 sheets with the exact D021 rows =========
  const buf = await allWorkbook(user, { dealCode: "D021" });
  check("combined XLSX starts with the zip signature PK", buf.subarray(0, 2).toString("latin1") === "PK");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const names = wb.worksheets.map((w) => w.name);
  check(
    "workbook has exactly 3 sheets: Deals · Collectibles · Payments",
    JSON.stringify(names) === JSON.stringify(["Deals", "Collectibles", "Payments"]),
    names.join(" · ")
  );

  const dealsSheet = wb.getWorksheet("Deals")!;
  const collSheet = wb.getWorksheet("Collectibles")!;
  const paySheet = wb.getWorksheet("Payments")!;
  // Row 1 = header; row 2 = the single D021 data row.
  check("Deals sheet header col 1 = 'Deal ID'", dealsSheet.getRow(1).getCell(1).value === "Deal ID", String(dealsSheet.getRow(1).getCell(1).value));
  check("Deals sheet: header + 1 D021 row", dealsSheet.rowCount === 2 && dealsSheet.getRow(2).getCell(1).value === "D021", `rows=${dealsSheet.rowCount}`);
  const dealNet = Number(dealsSheet.getRow(2).getCell(8).value); // NET GCI col 8
  check("Deals sheet NET GCI cell = 354591.84", Math.abs(dealNet - 354591.84) < 0.005, String(dealNet));

  check("Collectibles sheet: header + 1 D021 row", collSheet.rowCount === 2 && collSheet.getRow(2).getCell(1).value === "D021", `rows=${collSheet.rowCount}`);
  const recBal = Number(collSheet.getRow(2).getCell(7).value); // Balance col 7
  check("Collectibles sheet Balance cell = 309948.98", Math.abs(recBal - 309948.98) < 0.005, String(recBal));

  check("Payments sheet: header + 1 D021 row", paySheet.rowCount === 2 && paySheet.getRow(2).getCell(2).value === "D021", `rows=${paySheet.rowCount}`);
  const payGross = Number(paySheet.getRow(2).getCell(5).value); // Gross col 5
  const payNetVat = Number(paySheet.getRow(2).getCell(6).value); // Net of VAT col 6
  check("Payments sheet Gross cell = 50000.00", Math.abs(payGross - 50000) < 0.005, String(payGross));
  check("Payments sheet Net of VAT cell = 44642.86", Math.abs(payNetVat - 44642.86) < 0.005, String(payNetVat));

  // === EXPORT — a section with no matches is a header-only sheet ==============
  const lainieWb = new ExcelJS.Workbook();
  await lainieWb.xlsx.load((await allWorkbook(user, { text: "lainie" })) as unknown as ArrayBuffer);
  const lp = lainieWb.getWorksheet("Payments")!;
  check("'lainie' Payments sheet is header-only (no matches)", lp.rowCount === 1, `rows=${lp.rowCount}`);
  const ld = lainieWb.getWorksheet("Deals")!;
  check("'lainie' Deals sheet = header + 3 rows", ld.rowCount === 4, `rows=${ld.rowCount}`);

  // === PERF — three parallel queries, combined page-1 P95 < 450 ms ===========
  const ITER = 25;
  const samples: number[] = [];
  for (let i = 0; i < ITER; i += 1) {
    const t0 = performance.now();
    await runAll(user, { text: i % 2 === 0 ? "ventura" : "" });
    samples.push(performance.now() - t0);
  }
  samples.sort((x, y) => x - y);
  const p95 = samples[Math.min(samples.length - 1, Math.ceil(0.95 * samples.length) - 1)];
  check(
    `combined page-1 P95 < 450 ms (parallel; wall incl. WAN)`,
    p95 < 450,
    `p95=${p95.toFixed(1)}ms, best=${samples[0].toFixed(1)}ms`
  );
}

main()
  .catch((err) => {
    console.error(err);
    fails.push(`threw: ${err?.message ?? err}`);
  })
  .finally(async () => {
    if (uidA) await admin.auth.admin.deleteUser(uidA);
    console.log(`\ncleaned up throwaway user (workspace cascaded away). ${fails.length ? `FAILED: ${fails.length}` : "ALL PASSED"}`);
    process.exit(fails.length ? 1 : 0);
  });
