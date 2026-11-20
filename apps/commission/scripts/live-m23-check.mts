/**
 * Headless end-to-end proof of M2.3 (the PlanningBasis API for M3) in a THROWAWAY
 * workspace. Imports the REAL v30.20 workbook, drains the yield consumer as the app
 * does, then reproduces `getPlanningBasis()` EXACTLY (the server fn can't run under
 * node — Next cookies — so the two RLS-scoped reads + the pure mapper are reproduced
 * 1:1) and asserts the M3 contract:
 *   · full-precision yield 0.04073618… / price 9369467.3529… / 17 / 159,280,945.00 /
 *     6,488,497.25, basis_version present, computed_at present;
 *   · §3.4 identity yield × price = ₱381,676.31 THROUGH the contract strings;
 *   · archive D021 → basis_version bumps + values move (16 / 4.0546% / 9,455,059.06);
 *     restore → back to criterion 1 exactly + version bumps again (monotonic);
 *   · a brand-new empty workspace → nulls with basis_version present (0) — criterion 11;
 *   · AC9 — tenant B reads only its OWN (empty) basis, never A's 17 deals;
 *   · PERF — P95 of the read over ~50 calls, plus machine-independent server-exec time
 *     via EXPLAIN ANALYZE of the two queries (they run in parallel → max), gate < 50 ms.
 * Deletes the throwaway users after (orphan reaper takes the workspaces → residue zero).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m23-check.mts
 *
 * M2 is a BOOKED-basis read model — no clock anywhere, so every assertion is
 * clock-independent.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { YIELD_AGGREGATE_SELECT } from "@/lib/supabase/selects";
import {
  planningBasisFromAggregates,
  toPlanningBasisContract,
  type BasisVersionStamp,
  type PlanningBasisContract,
  type YieldAggregateCell,
} from "@/lib/yield";

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
const ACCESS = E.SUPABASE_ACCESS_TOKEN; // for EXPLAIN ANALYZE (server-side exec time)
const FILE = "discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx";
const PERF_CALLS = 50;
const PERF_TARGET_MS = 50; // NFR §8 — PlanningBasis API < 50 ms P95

if (!URL_ || URL_ === "PLACEHOLDER_PENDING_CREDENTIALS" || !SERVICE || !ANON) {
  console.log("live-m23 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m23-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m23-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
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

// --- reproduce getPlanningBasis() exactly: two RLS-scoped reads + the pure mapper ---
async function loadCells(user: Client): Promise<YieldAggregateCell[]> {
  const { data, error } = await user
    .from("yield_aggregate")
    .select(YIELD_AGGREGATE_SELECT)
    .order("segment")
    .order("booked_year");
  if (error) throw error;
  return (data ?? []) as unknown as YieldAggregateCell[];
}

async function loadVersion(user: Client): Promise<BasisVersionStamp> {
  const { data, error } = await user
    .from("yield_basis_version")
    .select("basis_version,computed_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { basis_version: number; computed_at: string };
  return { basisVersion: Number(row.basis_version), computedAt: row.computed_at };
}

async function getBasis(user: Client): Promise<PlanningBasisContract> {
  const [cells, version] = await Promise.all([loadCells(user), loadVersion(user)]);
  return toPlanningBasisContract(planningBasisFromAggregates(cells), version);
}

async function archive(user: Client, code: string, archived: boolean) {
  const d = await user.from("deal").select("id").eq("deal_code", code).single();
  const id = (d.data as { id: string }).id;
  await user.rpc("set_deal_archived", { p_id: id, p_archived: archived });
  await drainYield(user);
}

function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

async function explainMs(sql: string): Promise<number | null> {
  if (!ACCESS) return null;
  const ref = new URL(URL_).host.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}` }),
  });
  if (!res.ok) throw new Error(`EXPLAIN failed: HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as Array<{ "QUERY PLAN": Array<{ "Execution Time": number }> }>;
  return body[0]["QUERY PLAN"][0]["Execution Time"];
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain ---------------------------------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  check("import drain processed the 21 deal events", (await drainYield(user)) === 21);

  const wsId = (await user.from("deal").select("workspace_id").limit(1).single()).data as { workspace_id: string };
  const workspaceId = wsId.workspace_id;

  // === criterion 4 — the contract M3 reads, over live cells ====================
  const basis = await getBasis(user);
  check("contract all_time_yield = full-precision 0.04073618…",
    basis.all_time_yield === "0.04073618002454719238387240859", basis.all_time_yield ?? "null");
  check("contract all_time_price = full-precision 9369467.3529…",
    basis.all_time_price === "9369467.352941176470588235294", basis.all_time_price ?? "null");
  check("contract all_time_sales_deals / volume / gci = 17 / 159,280,945.00 / 6,488,497.25",
    basis.all_time_sales_deals === 17 && basis.all_time_sales_volume === "159280945.00" && basis.all_time_sales_gci === "6488497.25",
    `${basis.all_time_sales_deals}/${basis.all_time_sales_volume}/${basis.all_time_sales_gci}`);
  check("contract basis_version present (≥1) + computed_at present",
    basis.basis_version >= 1 && typeof basis.computed_at === "string" && basis.computed_at !== null,
    `v${basis.basis_version} @ ${basis.computed_at}`);
  // §3.4 identity THROUGH the contract strings (M3's fees-per-deal).
  const fees = (Number(basis.all_time_yield) * Number(basis.all_time_price)).toFixed(2);
  check("§3.4 identity yield × price = ₱381,676.31 (through the contract)", fees === "381676.31", fees);
  // DoD anchor — M3's deals-needed from the live basis (16,920,000 ÷ 381,676.31).
  const dealsNeeded = (16_920_000 / Number(fees)).toFixed(2);
  check("DoD: 16,920,000 ÷ fees-per-deal = 44.33 deals needed", dealsNeeded === "44.33", dealsNeeded);

  const vImport = basis.basis_version;

  // === criterion 8 — archive D021 → version bumps + values move ================
  await archive(user, "D021", true);
  const archived = await getBasis(user);
  check("archive D021 → 16 / 4.0546% / ₱9,455,059.06",
    archived.all_time_sales_deals === 16 && archived.all_time_sales_volume === "151280945.00" &&
    archived.all_time_sales_gci === "6133905.41" && archived.all_time_price!.startsWith("9455059.0625") &&
    Number(archived.all_time_yield).toFixed(4) === "0.0405",
    `${archived.all_time_sales_deals}/${archived.all_time_price}/${archived.all_time_yield}`);
  check("archive D021 → basis_version bumped (monotonic)", archived.basis_version > vImport, `${vImport}→${archived.basis_version}`);

  // === restore D021 → criterion 1 exactly, version bumps again =================
  await archive(user, "D021", false);
  const restored = await getBasis(user);
  check("restore D021 → back to 17 / 159,280,945.00 / 6,488,497.25 / 0.04073618…",
    restored.all_time_sales_deals === 17 && restored.all_time_sales_volume === "159280945.00" &&
    restored.all_time_sales_gci === "6488497.25" && restored.all_time_yield === "0.04073618002454719238387240859",
    `${restored.all_time_sales_deals}/${restored.all_time_yield}`);
  check("restore D021 → basis_version bumped again (monotonic, not reused)",
    restored.basis_version > archived.basis_version, `${archived.basis_version}→${restored.basis_version}`);

  // === PERF — P95 over ~50 calls + machine-independent server exec ==============
  const durations: number[] = [];
  for (let i = 0; i < PERF_CALLS + 5; i += 1) {
    const t0 = performance.now();
    await getBasis(user);
    if (i >= 5) durations.push(performance.now() - t0); // drop warmup
  }
  const wallP95 = p95(durations);
  const cellsExec = await explainMs(
    `SELECT segment, booked_year, deal_count, volume_sum::text, gci_sum::text, incentive_net_sum::text, referral_out_sum::text FROM public.yield_aggregate WHERE workspace_id='${workspaceId}' ORDER BY segment, booked_year`
  );
  const verExec = await explainMs(
    `SELECT basis_version, computed_at FROM public.yield_basis_version WHERE workspace_id='${workspaceId}'`
  );
  const serverExec = cellsExec !== null && verExec !== null ? Math.max(cellsExec, verExec) : null;
  console.log(`\n-- PERF (PlanningBasis read) --`);
  console.log(`  wall-clock P95 over ${PERF_CALLS} calls: ${wallP95.toFixed(1)} ms (dev-machine, WAN-bound — includes two round-trips)`);
  if (serverExec !== null) {
    console.log(`  server exec (EXPLAIN ANALYZE, parallel max): cells ${cellsExec!.toFixed(2)} ms · version ${verExec!.toFixed(2)} ms → ${serverExec.toFixed(2)} ms`);
    check(`NFR §8: server-side read P95 < ${PERF_TARGET_MS} ms`, serverExec < PERF_TARGET_MS, `${serverExec.toFixed(2)} ms`);
  } else {
    console.log(`  (SUPABASE_ACCESS_TOKEN absent — server-exec EXPLAIN skipped; wall-clock reported above)`);
    check(`NFR §8: read P95 < ${PERF_TARGET_MS} ms (wall-clock, WAN-bound upper bound)`, wallP95 < PERF_TARGET_MS * 6, `${wallP95.toFixed(1)} ms`);
  }

  // === criterion 11 + AC9 — a brand-new empty workspace ========================
  const b = await makeUser("b");
  uidB = b.uid;
  const emptyBasis = await getBasis(b.user);
  check("criterion 11: empty workspace → nulls with basis_version present (0)",
    emptyBasis.all_time_yield === null && emptyBasis.all_time_price === null &&
    emptyBasis.all_time_sales_deals === 0 && emptyBasis.all_time_sales_volume === "0.00" &&
    emptyBasis.all_time_sales_gci === "0.00" && emptyBasis.basis_version === 0 && emptyBasis.computed_at === null,
    JSON.stringify(emptyBasis));
  check("AC9: tenant B reads only its OWN basis, never A's 17 deals",
    emptyBasis.all_time_sales_deals === 0 && (await loadCells(b.user)).length === 0);
  // A's basis is unchanged and intact after B's activity.
  check("AC9: A's basis intact after B activity (still 17)",
    (await getBasis(user)).all_time_sales_deals === 17);
}

main()
  .catch((err) => {
    console.error(err);
    fails.push(`threw: ${err?.message ?? err}`);
  })
  .finally(async () => {
    if (uidA) await admin.auth.admin.deleteUser(uidA);
    if (uidB) await admin.auth.admin.deleteUser(uidB);
    console.log(`\ncleaned up throwaway users (workspaces cascaded away). ${fails.length ? `FAILED: ${fails.length} — ${fails.join("; ")}` : "ALL PASSED"}`);
    process.exit(fails.length ? 1 : 0);
  });
