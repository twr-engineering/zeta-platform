/**
 * Headless end-to-end proof of M2.4 (the Yield Summary screen's data path) in a
 * THROWAWAY workspace. Imports the REAL v30.20 workbook, drains the yield consumer as
 * the app does, then reproduces getYieldSummaryView EXACTLY (the server fn can't run
 * under node — Next cookies — so the three RLS-scoped reads + the pure reducers are
 * reproduced 1:1) and asserts what the screen renders:
 *   · the five-segment table + TOTAL + memos + averages to the centavo (§9 criterion 1–3);
 *   · realized yields at 4 dp (§7 — the export/tooltip precision the 2-dp screen hides);
 *   · the Planning Basis card 4.0736% / ₱9,369,467.35 (display-rounded);
 *   · the year filter: 2026 ≡ All, and 2027 zeroes the table while the planning basis is
 *     BYTE-IDENTICAL (Rule 4 — criterion 5);
 *   · the Rule 9 partition invariant: zero unclassified deals (loadUnclassifiedDealCodes);
 *   · the export rows (yieldReportToRows) reproduce the same fixtures at 4-dp yields.
 * Deletes the throwaway user after (orphan reaper takes the workspace → residue zero).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m24-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { YIELD_AGGREGATE_SELECT } from "@/lib/supabase/selects";
import {
  reportFromAggregates,
  planningBasisFromAggregates,
  classifySegment,
  type ClassifiableDeal,
  type YearFilter,
  type YieldAggregateCell,
} from "@/lib/yield";
import { yieldReportToRows, type YieldExportRow } from "@/lib/yield/export-rows";

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
  console.log("live-m24 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m24-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m24-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

async function drainYield(user: Client): Promise<number> {
  let total = 0;
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc("consume_yield_events", { p_limit: 500 });
    if (error) throw error;
    const p = (data as { processed?: number })?.processed ?? 0;
    total += p;
    if (p === 0) break;
  }
  return total;
}

async function loadCells(user: Client): Promise<YieldAggregateCell[]> {
  const { data, error } = await user
    .from("yield_aggregate")
    .select(YIELD_AGGREGATE_SELECT)
    .order("segment")
    .order("booked_year");
  if (error) throw error;
  return (data ?? []) as unknown as YieldAggregateCell[];
}

async function loadUnclassified(user: Client): Promise<string[]> {
  const { data, error } = await user
    .from("deal")
    .select("deal_code,transaction_type,deal_type,representation")
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? [])
    .filter((d) => classifySegment(d as unknown as ClassifiableDeal) === null)
    .map((d) => (d as { deal_code: string }).deal_code);
}

async function basisVersion(user: Client): Promise<number> {
  const { data } = await user.from("yield_basis_version").select("basis_version").maybeSingle();
  return data ? Number((data as { basis_version: number }).basis_version) : 0;
}

/** Screen/export rows for a year filter (reproduces getYieldSummaryView + yieldReportToRows). */
function rowsFor(cells: YieldAggregateCell[], year: YearFilter): YieldExportRow[] {
  return yieldReportToRows(reportFromAggregates(cells, year), planningBasisFromAggregates(cells));
}
function line(rows: YieldExportRow[], label: string): YieldExportRow {
  return rows.find((r) => r.line === label)!;
}

let uid = "";

async function main() {
  const a = await makeUser("data");
  uid = a.uid;
  const user = a.user;

  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  check("import drain processed the 21 deal events", (await drainYield(user)) === 21);

  const cells = await loadCells(user);

  // === criterion 1–3 — the segment table, TOTAL, memos, averages (year = All) =====
  const all = rowsFor(cells, "all");
  const resale = line(all, "Resale");
  check("Resale 7 / 55,251,000.00 / 2,687,550.00 / 4.8643% / 34.69%",
    resale.deals === 7 && resale.volume === "55251000.00" && resale.gci === "2687550.00" &&
    resale.realizedYield === "4.8643%" && resale.shareOfSales === "34.69%",
    JSON.stringify(resale));
  const dev = line(all, "Developer");
  check("Developer 10 / 104,029,945.00 / 3,800,947.25 / 3.6537% / 65.31%",
    dev.deals === 10 && dev.volume === "104029945.00" && dev.gci === "3800947.25" &&
    dev.realizedYield === "3.6537%" && dev.shareOfSales === "65.31%", JSON.stringify(dev));
  const sub = line(all, "SALES SUBTOTAL");
  check("SALES SUBTOTAL 17 / 159,280,945.00 / 6,488,497.25 / 4.0736% / 100.00%",
    sub.deals === 17 && sub.volume === "159280945.00" && sub.gci === "6488497.25" &&
    sub.realizedYield === "4.0736%" && sub.shareOfSales === "100.00%", JSON.stringify(sub));
  const rental = line(all, "Rental (on rent)");
  check("Rental 4 / 2,400,000.00 / 200,000.00 / 8.3333% / — (share null)",
    rental.deals === 4 && rental.volume === "2400000.00" && rental.gci === "200000.00" &&
    rental.realizedYield === "8.3333%" && rental.shareOfSales === null, JSON.stringify(rental));
  const referral = line(all, "Referral (fees)");
  check("Referral empty 0 / 0.00 / 0.00 / — / —",
    referral.deals === 0 && referral.volume === "0.00" && referral.gci === "0.00" &&
    referral.realizedYield === null && referral.shareOfSales === null, JSON.stringify(referral));

  check("TOTAL GCI (ALL OPERATIONS) = 6,688,497.25",
    line(all, "TOTAL GCI (ALL OPERATIONS)").gci === "6688497.25");
  check("memo Incentives (+) = 357,142.87 (stored-value sum, Rule 8)",
    line(all, "Incentives (+) — memo, already inside the GCI above").gci === "357142.87");
  check("memo Referral-outs (−) = -75,000.00 (shown as parentheses on screen)",
    line(all, "Referral-outs (−) — memo, already inside the GCI above").gci === "-75000.00");
  check("Resale avg 7,893,000.00 · Developer avg 10,402,994.50 · BLENDED 9,369,467.35",
    line(all, "Resale avg price").volume === "7893000.00" &&
    line(all, "Developer avg price").volume === "10402994.50" &&
    line(all, "BLENDED SALE avg price → feeds calculator").volume === "9369467.35");
  check("Rental annual GCI (YTD) = 200,000.00",
    line(all, "Rental annual GCI (YTD)").gci === "200000.00");

  // === criterion 4 — the Planning Basis card (display-rounded) =====================
  check("Planning Basis yield 4.0736% / price 9,369,467.35 (all-time, display-rounded)",
    line(all, "PLANNING BASIS — All-time blended yield (AllTimeYield)").realizedYield === "4.0736%" &&
    line(all, "PLANNING BASIS — All-time blended avg price (AllTimePrice)").volume === "9369467.35" &&
    line(all, "PLANNING BASIS — All-time sales (ignores the year filter)").deals === 17);

  // === criterion 1 — 2026 ≡ All (byte-identical rows) =============================
  const y2026 = rowsFor(cells, 2026);
  check("2026 filter is byte-identical to All",
    JSON.stringify(y2026) === JSON.stringify(all));

  // === criterion 5 — 2027 zeroes the table, planning basis UNMOVED (Rule 4) =======
  const y2027 = rowsFor(cells, 2027);
  const sub27 = line(y2027, "SALES SUBTOTAL");
  check("2027 SALES SUBTOTAL zeroed: 0 / 0.00 / 0.00 / — / —",
    sub27.deals === 0 && sub27.volume === "0.00" && sub27.gci === "0.00" &&
    sub27.realizedYield === null && sub27.shareOfSales === null, JSON.stringify(sub27));
  check("2027 Planning Basis UNMOVED (4.0736% / 9,369,467.35 / 17)",
    line(y2027, "PLANNING BASIS — All-time blended yield (AllTimeYield)").realizedYield === "4.0736%" &&
    line(y2027, "PLANNING BASIS — All-time blended avg price (AllTimePrice)").volume === "9369467.35" &&
    line(y2027, "PLANNING BASIS — All-time sales (ignores the year filter)").deals === 17);

  // === Rule 9 partition invariant + basis version =================================
  check("Rule 9: zero unclassified deals (clean partition)",
    (await loadUnclassified(user)).length === 0);
  check("basis_version present (≥1 after the first sales cell)",
    (await basisVersion(user)) >= 1);
}

main()
  .catch((err) => {
    console.error(err);
    fails.push(`threw: ${err?.message ?? err}`);
  })
  .finally(async () => {
    if (uid) await admin.auth.admin.deleteUser(uid);
    console.log(`\ncleaned up throwaway user (workspace cascaded away). ${fails.length ? `FAILED: ${fails.length} — ${fails.join("; ")}` : "ALL PASSED"}`);
    process.exit(fails.length ? 1 : 0);
  });
