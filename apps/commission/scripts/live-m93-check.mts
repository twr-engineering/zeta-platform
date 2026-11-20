/**
 * Headless end-to-end proof of M9.3 (Search export & hardening) in a THROWAWAY
 * workspace. Imports the REAL v30.20 workbook, drains the deal + payment consumers,
 * then reproduces the export data path EXACTLY as /api/export/search does — page the
 * source RPC as a REAL JWT user (`search_*`, RLS-scoped), map to the §3.2 projection,
 * and assemble the file with the SAME format helpers (toCsv / toXlsxRows) and the
 * SAME column spec (searchExportSpec) — proving:
 *
 *   AC11  Collectibles Open + only-with-balance export → exactly the 14 rows, in
 *         balance-desc order (D013 first at 906,752.23, D021 present at 309,948.98),
 *         with the §3.2 Collectibles columns verbatim; XLSX assembles non-empty.
 *   ALL FILTERS  Open + balance + text 'lainie' → the export honours every filter
 *         (→ D013/D014/D015 only), and Deal ID D021 → 1 row (filters compose).
 *   ARCHIVED  the archived D002 receivable is present in the open-balance export
 *         (Rule 10 — archived rows flow through export, not filtered out).
 *   PAID YEAR  Payments Year 2026 export → 8 rows; Year 2025 → a header-only file.
 *   EMPTY  a zero-match export streams a valid header-only file (§6 — the button is
 *         disabled at zero rows, but a direct hit must not error).
 *   AC9    a second tenant's export is header-only (RLS — own rows only).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m93-check.mts
 *
 * Deletes the throwaway users after (orphan reaper takes the workspaces →
 * delta-residue zero). CI-safe: skips with exit 0 on placeholder credentials.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import writeXlsxFile from "write-excel-file/node";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { toCsv, toXlsxRows, xlsxColumnWidths } from "@/lib/export/format";
import { searchExportSpec } from "@/lib/search/export-columns";
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
  console.log("live-m93 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m93-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m93-pw";
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

/** Page the source RPC to the full set (as /api/export/search does), map, assemble. */
async function exportSearch(
  user: Client,
  query: Pick<SearchQuery, "source"> & Partial<SearchQuery>
): Promise<{ rows: SearchResultRow[]; csvLines: string[]; xlsxBytes: number }> {
  const source = query.source;
  const args: Record<string, unknown> = {
    p_year: query.year ?? undefined,
    p_deal_code: query.dealCode ?? undefined,
    p_text: query.text && query.text.length > 0 ? query.text : undefined,
    p_sort: query.sort ?? "default",
  };
  if (source === "collectibles") {
    args.p_status = query.status ?? undefined;
    args.p_only_with_balance = query.onlyWithBalance ?? false;
  }
  const rows: SearchResultRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await user.rpc(RPC[source], { ...args, p_limit: 1000, p_offset: offset });
    if (error) throw new Error(`${source} export paging: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    if (batch.length === 0) break;
    for (const r of batch) rows.push(mapRow(source, r));
    if (batch.length < 1000) break;
  }
  const spec = searchExportSpec(source);
  const ds = { name: spec.sheet, sheet: spec.sheet, columns: spec.columns, rows };
  const csv = toCsv(ds).replace(/^﻿/, "");
  const csvLines = csv.trimEnd().split("\r\n");
  const xlsxBuf = await writeXlsxFile(toXlsxRows(ds), { columns: xlsxColumnWidths(ds), sheet: spec.sheet }).toBuffer();
  return { rows, csvLines, xlsxBytes: xlsxBuf.length };
}

let uidA = "";
let uidB = "";

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

  // Archive D002 via the write path so its receivable is an ARCHIVED row inside the
  // open-balance set (Rule 10 — archived rows still export).
  const d002 = await user.from("deal").select("id").eq("deal_code", "D002").single();
  await user.rpc("set_deal_archived", { p_id: (d002.data as { id: string }).id, p_archived: true });
  await drain(user, "consume_deal_events");

  // === AC11 — Collectibles Open + only-with-balance export ====================
  const open = await exportSearch(user, { source: "collectibles", status: "open", onlyWithBalance: true, sort: "default" });
  check("AC11 Open + only-with-balance → 14 data rows", open.rows.length === 14, String(open.rows.length));
  check("AC11 CSV = header + 14 rows", open.csvLines.length === 15, String(open.csvLines.length));

  const header = open.csvLines[0];
  check(
    "AC11 CSV header = §3.2 Collectibles columns verbatim",
    header === "Deal ID,Client,Property,Deal Type,Total Collectible,Collected,Balance,Status",
    header
  );

  const codes = open.rows.map((r) => (r as CollectibleSearchRow).dealCode);
  check("AC11 balance-desc → D013 first", codes[0] === "D013", codes[0]);
  check("AC11 first CSV data row is D013", open.csvLines[1].startsWith("D013,"), open.csvLines[1].slice(0, 24));
  const first = open.rows[0] as CollectibleSearchRow;
  check("AC11 D013 balance = 906,752.23 (exact string, not re-derived)", first.balance === "906752.23", String(first.balance));
  const d021 = open.rows.find((r) => (r as CollectibleSearchRow).dealCode === "D021") as CollectibleSearchRow | undefined;
  check("AC11 D021 present at balance 309,948.98", !!d021 && d021.balance === "309948.98", String(d021?.balance));
  check(
    "AC11 the 14 = {D002,D003,D005,D007,D008..D016,D021}",
    JSON.stringify([...codes].sort()) ===
      JSON.stringify(["D002","D003","D005","D007","D008","D009","D010","D011","D012","D013","D014","D015","D016","D021"]),
    codes.join(",")
  );
  check("AC11 XLSX assembles non-empty", open.xlsxBytes > 0, `${open.xlsxBytes} bytes`);

  // archived D002 flows through the export (Rule 10)
  const arch = open.rows.find((r) => (r as CollectibleSearchRow).dealCode === "D002") as CollectibleSearchRow | undefined;
  check("archived D002 IS present in the export with archived=true (Rule 10)", !!arch && arch.archived === true, String(arch?.archived));

  // === all filters AND-combine in the export (Rule 5) =========================
  const lainie = await exportSearch(user, { source: "collectibles", status: "open", onlyWithBalance: true, text: "lainie", sort: "default" });
  check(
    "Open + balance + text 'lainie' → exactly D013/D014/D015",
    JSON.stringify(lainie.rows.map((r) => (r as CollectibleSearchRow).dealCode).sort()) ===
      JSON.stringify(["D013", "D014", "D015"]),
    lainie.rows.map((r) => (r as CollectibleSearchRow).dealCode).join(",")
  );
  const only021 = await exportSearch(user, { source: "collectibles", dealCode: "D021" });
  check("Deal ID D021 export → 1 row (filters compose)", only021.rows.length === 1);

  // === Payments paid-year export (Rule 3) =====================================
  const pay2026 = await exportSearch(user, { source: "payments", year: 2026, sort: "default" });
  check("Payments Year 2026 export → 8 rows", pay2026.rows.length === 8, String(pay2026.rows.length));
  check(
    "Payments Year 2026 header = §3.2 Payments columns",
    pay2026.csvLines[0] === "Date,Deal ID,Client,Property,Gross,Net of VAT,Net Cash",
    pay2026.csvLines[0]
  );
  const pay2025 = await exportSearch(user, { source: "payments", year: 2025 });
  check("Payments Year 2025 export → header-only file (0 data rows)", pay2025.rows.length === 0 && pay2025.csvLines.length === 1);

  // === empty result → valid header-only file (§6) =============================
  const empty = await exportSearch(user, { source: "deals", text: "zzzznomatch" });
  check("empty match → header-only CSV, no error", empty.rows.length === 0 && empty.csvLines.length === 1 && empty.xlsxBytes > 0);

  // === AC9 — cross-tenant export is header-only (RLS) =========================
  const b = await makeUser("b");
  uidB = b.uid;
  const other = await exportSearch(b.user, { source: "collectibles", status: "open", onlyWithBalance: true });
  check("AC9 second tenant's export → header-only (own rows only)", other.rows.length === 0 && other.csvLines.length === 1);
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
