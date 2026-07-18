/**
 * Headless end-to-end proof of M7.1 (the Source Performance aggregation service) in
 * a THROWAWAY workspace. Imports the REAL v30.20 workbook, drains the consumers as
 * the app does, then runs the SAME pure builder the app ships (sourcePerformance)
 * over the RLS-scoped receivables + the M0 lead-source master list, and asserts every
 * PRD §9 row to the centavo — the cross-module ties, the FR-M7-03/OQ1 Referral
 * divergence, the booking-year filter (AC2), AC9 cross-tenant isolation, and the
 * archived-source behaviour (archive a source WITH deals → still reported "(inactive)").
 * Deletes the throwaway users after (orphan reaper takes the workspaces).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m71-check.mts
 *
 * Clock-independent: M7 is a booked-basis report (no aging/idle), so every figure is
 * stable at any Manila date. Stored-2dp precision note: YouTube Outstanding lands on
 * ₱2,058,398.43 (the PRD table prints the full-precision ideal .44) and Lamudi Avg on
 * ₱431,501.57 (.56 ideal) — the receivable stores numeric(14,2); the totals tie to M6
 * at .39 either way (see the fixture test header + the completion note).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { RECEIVABLE_SELECT, LEAD_SOURCE_SELECT } from "@/lib/supabase/selects";
import {
  sourcePerformance,
  distinctBookedYears,
  type SourceLeadSource,
} from "@/lib/source-performance/build";
import type { ProjectionReceivable } from "@/lib/receivables/projections";

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
  console.log("live-m71 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m71-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m71-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
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

/** Load receivables the way listReceivables does (RLS-scoped; idle/age irrelevant for M7). */
async function loadReceivables(user: Client): Promise<ProjectionReceivable[]> {
  const { data, error } = await user
    .from("receivable")
    .select(`${RECEIVABLE_SELECT},developer:developer_id(name)`)
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? []) as unknown as ProjectionReceivable[];
}

/** Load the lead sources the way allLeadSources does (active + archived). */
async function loadLeadSources(user: Client): Promise<SourceLeadSource[]> {
  const { data, error } = await user
    .from("lead_source")
    .select(LEAD_SOURCE_SELECT)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SourceLeadSource[];
}

async function importWorkbook(user: Client) {
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_payment_events");
}

async function wsOf(user: Client): Promise<string> {
  const { data } = await user.from("receivable").select("workspace_id").limit(1).single();
  return (data as { workspace_id: string }).workspace_id;
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  await importWorkbook(user);
  const receivables = await loadReceivables(user);
  const sources = await loadLeadSources(user);

  const report = sourcePerformance(receivables, sources, "all");
  const bySrc = new Map(report.rows.map((r) => [r.source, r]));
  const row = (name: string) => bySrc.get(name);

  // === PRD §9 criterion-1 table (Year = All), to the centavo =================
  const yt = row("YouTube");
  check(
    "YouTube 7 / 2,455,541.29 / 36.71% / avg 350,791.61",
    !!yt && yt.deals === 7 && yt.bookedNetGci === "2455541.29" && yt.pctOfNetGci === "0.367129" && yt.avgNetGciPerDeal === "350791.61",
    `${yt?.deals}/${yt?.bookedNetGci}/${yt?.pctOfNetGci}/${yt?.avgNetGciPerDeal}`
  );
  check(
    "YouTube collected 397,142.86 / 16.17% / outstanding 2,058,398.43 (stored-2dp; PRD .44)",
    !!yt && yt.collectedNet === "397142.86" && yt.pctCollected === "0.161733" && yt.outstandingNet === "2058398.43",
    `${yt?.collectedNet}/${yt?.pctCollected}/${yt?.outstandingNet}`
  );
  check(
    "YouTube R+R 352,500 / R+R out 0 / Developer 2,103,041.29",
    !!yt && yt.resaleRentalNetGci === "352500.00" && yt.resaleRentalOutstanding === "0.00" && yt.developerNetGci === "2103041.29",
    `${yt?.resaleRentalNetGci}/${yt?.resaleRentalOutstanding}/${yt?.developerNetGci}`
  );

  const rc = row("Repeat Client");
  check(
    "Repeat Client 9 / 1,616,414.70 / 24.17% / avg 179,601.63",
    !!rc && rc.deals === 9 && rc.bookedNetGci === "1616414.70" && rc.pctOfNetGci === "0.241671" && rc.avgNetGciPerDeal === "179601.63",
    `${rc?.deals}/${rc?.bookedNetGci}/${rc?.pctOfNetGci}/${rc?.avgNetGciPerDeal}`
  );
  check(
    "Repeat Client collected 200,000 / 12.37% / out 1,416,414.70 / R+R out 1,099,000 / Dev 317,414.70",
    !!rc && rc.collectedNet === "200000.00" && rc.pctCollected === "0.123731" && rc.outstandingNet === "1416414.70" && rc.resaleRentalOutstanding === "1099000.00" && rc.developerNetGci === "317414.70",
    `${rc?.collectedNet}/${rc?.outstandingNet}/${rc?.resaleRentalOutstanding}/${rc?.developerNetGci}`
  );

  const lam = row("Lamudi");
  check(
    "Lamudi 2 / 863,003.13 / 12.90% / avg 431,501.57 (stored-2dp; PRD .56) / collected 436,050 / 50.53% / out 426,953.13",
    !!lam && lam.deals === 2 && lam.bookedNetGci === "863003.13" && lam.pctOfNetGci === "0.129028" && lam.avgNetGciPerDeal === "431501.57" && lam.collectedNet === "436050.00" && lam.pctCollected === "0.505270" && lam.outstandingNet === "426953.13",
    `${lam?.deals}/${lam?.bookedNetGci}/${lam?.avgNetGciPerDeal}/${lam?.collectedNet}/${lam?.pctCollected}/${lam?.outstandingNet}`
  );

  const ref = row("Referral");
  check(
    "Referral 1 / 800,000 / 11.96% — OQ1: Collected 875,000 (Σ collected, NOT sheet 800,000) / 109.38% / out 0",
    !!ref && ref.deals === 1 && ref.bookedNetGci === "800000.00" && ref.pctOfNetGci === "0.119608" && ref.collectedNet === "875000.00" && ref.pctCollected === "1.093750" && ref.outstandingNet === "0.00",
    `${ref?.bookedNetGci}/${ref?.collectedNet}/${ref?.pctCollected}/${ref?.outstandingNet}`
  );

  const sph = row("Sphere / Personal Network");
  check(
    "Sphere 1 / 630,813.93 / 9.43% / collected 0 / 0.00% / out 630,813.93 / Dev 630,813.93",
    !!sph && sph.deals === 1 && sph.bookedNetGci === "630813.93" && sph.pctOfNetGci === "0.094313" && sph.collectedNet === "0.00" && sph.pctCollected === "0.000000" && sph.outstandingNet === "630813.93" && sph.developerNetGci === "630813.93",
    `${sph?.bookedNetGci}/${sph?.pctOfNetGci}/${sph?.collectedNet}/${sph?.outstandingNet}`
  );

  const fb = row("Facebook Organic");
  check(
    "Facebook Organic 1 / 322,724.20 / 4.83% / out 322,724.20 / Dev 322,724.20",
    !!fb && fb.deals === 1 && fb.bookedNetGci === "322724.20" && fb.pctOfNetGci === "0.048251" && fb.outstandingNet === "322724.20" && fb.developerNetGci === "322724.20",
    `${fb?.bookedNetGci}/${fb?.pctOfNetGci}/${fb?.outstandingNet}`
  );

  // === TOTAL row (§3.5) ======================================================
  const t = report.total;
  check(
    "TOTAL 21 / 6,688,497.25 / 100.00% / avg 318,499.87",
    t.deals === 21 && t.bookedNetGci === "6688497.25" && t.pctOfNetGci === "1.000000" && t.avgNetGciPerDeal === "318499.87",
    `${t.deals}/${t.bookedNetGci}/${t.pctOfNetGci}/${t.avgNetGciPerDeal}`
  );
  check(
    "TOTAL Collected 1,908,192.86 / 28.53% (from totals) / Outstanding 4,855,304.39",
    t.collectedNet === "1908192.86" && t.pctCollected === "0.285295" && t.outstandingNet === "4855304.39",
    `${t.collectedNet}/${t.pctCollected}/${t.outstandingNet}`
  );
  check(
    "TOTAL R+R 2,887,550 / R+R out 1,099,000 / Developer 3,800,947.25",
    t.resaleRentalNetGci === "2887550.00" && t.resaleRentalOutstanding === "1099000.00" && t.developerNetGci === "3800947.25",
    `${t.resaleRentalNetGci}/${t.resaleRentalOutstanding}/${t.developerNetGci}`
  );

  // === Cross-module ties (§8) ================================================
  const sumCol = (get: (r: (typeof report.rows)[number]) => string) =>
    report.rows.reduce((acc, r) => acc + Number(get(r)), 0).toFixed(2);
  check("§8 TOTAL Booked = M2 all-ops GCI 6,688,497.25", sumCol((r) => r.bookedNetGci) === "6688497.25" && t.bookedNetGci === "6688497.25");
  check("§8 TOTAL Collected = M6 Total Collected Net 1,908,192.86", sumCol((r) => r.collectedNet) === "1908192.86" && t.collectedNet === "1908192.86");
  check("§8 TOTAL Outstanding = M6 Balance Outstanding 4,855,304.39", sumCol((r) => r.outstandingNet) === "4855304.39" && t.outstandingNet === "4855304.39");

  // === Visibility: 6 sources with deals + 7 active zero rows =================
  const withDeals = report.rows.filter((r) => r.deals > 0).length;
  const zeroRows = report.rows.filter((r) => r.deals === 0);
  check("Visibility: 6 sources with deals + 7 active zero rows = 13 rows", withDeals === 6 && zeroRows.length === 7 && report.rows.length === 13, `${withDeals}+${zeroRows.length}=${report.rows.length}`);
  check("Zero rows render ₱0.00 (not blank) + no ratio/avg", zeroRows.every((z) => z.bookedNetGci === "0.00" && z.outstandingNet === "0.00" && z.avgNetGciPerDeal === null && z.pctCollected === null));

  // === Default ordering Booked desc (§4 rule 10) =============================
  check(
    "Ordering: YouTube→Repeat Client→Lamudi→Referral→Sphere→Facebook Organic",
    JSON.stringify(report.rows.filter((r) => r.deals > 0).map((r) => r.source)) ===
      JSON.stringify(["YouTube", "Repeat Client", "Lamudi", "Referral", "Sphere / Personal Network", "Facebook Organic"])
  );

  // === AC2: Year = 2026 == Year = All (booking-year filter) ==================
  const y2026 = sourcePerformance(receivables, sources, 2026);
  check("AC2 Year=2026 equals Year=All (booking-year filter)", JSON.stringify(y2026.rows) === JSON.stringify(report.rows) && JSON.stringify(y2026.total) === JSON.stringify(report.total));
  check("FR-M7-02 distinct booked years = [2026]", JSON.stringify(distinctBookedYears(receivables)) === "[2026]");

  // === AC5 / edge case 18: archive a SOURCE that has deals → still reported ===
  const ws = await wsOf(user);
  await admin.from("lead_source").update({ archived_at: "2026-07-01T00:00:00Z" }).eq("workspace_id", ws).eq("name", "Lamudi");
  const sources2 = await loadLeadSources(user);
  const report2 = sourcePerformance(receivables, sources2, "all");
  const lam2 = report2.rows.find((r) => r.leadSourceId === lam!.leadSourceId);
  check(
    "Archive Lamudi (has deals) → 'Lamudi (inactive)', figures unchanged (2 / 863,003.13)",
    !!lam2 && lam2.source === "Lamudi (inactive)" && lam2.archived === true && lam2.deals === 2 && lam2.bookedNetGci === "863003.13",
    `${lam2?.source}/${lam2?.deals}/${lam2?.bookedNetGci}`
  );
  check("Archive-with-deals: TOTAL Booked still ties (no NET GCI dropped)", report2.total.bookedNetGci === "6688497.25");
  // restore for cleanliness (workspace is torn down anyway)
  await admin.from("lead_source").update({ archived_at: null }).eq("workspace_id", ws).eq("name", "Lamudi");

  // === AC9: cross-tenant isolation ==========================================
  const b = await makeUser("b");
  uidB = b.uid;
  const receivablesB = await loadReceivables(b.user);
  const sourcesB = await loadLeadSources(b.user);
  const reportB = sourcePerformance(receivablesB, sourcesB, "all");
  check("AC9 tenant B sees 0 deals of A (TOTAL 0 / booked 0.00)", reportB.total.deals === 0 && reportB.total.bookedNetGci === "0.00", `${reportB.total.deals}/${reportB.total.bookedNetGci}`);
  check("AC9 tenant A still intact after B read (TOTAL 21 / 6,688,497.25)", sourcePerformance(await loadReceivables(user), await loadLeadSources(user), "all").total.bookedNetGci === "6688497.25");
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
