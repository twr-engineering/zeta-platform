/**
 * Headless end-to-end proof of M2.2 (materialized yield aggregates + event-driven
 * restatement + reconciliation) in a THROWAWAY workspace. Imports the REAL v30.20
 * workbook, drains the yield consumer as the app does, then:
 *   · reconstructs the §3.3 report + §3.4 planning basis FROM the materialized cells
 *     (reportFromAggregates / planningBasisFromAggregates) and asserts every §9 value
 *     to the centavo;
 *   · asserts ZERO drift of the materialized read model vs the M2.1 pure functions
 *     over the same raw deals (the DoD contract), AND vs the SQL reconciliation RPC;
 *   · restates on create / edit / archive / restore, measuring latency (≤2 s);
 *   · proves idempotency (re-drain = no-op) + replay-from-cursor-0 (identical cells);
 *   · proves basis_version bumps on sales-segment changes only;
 *   · runs a randomized-mutation property test (zero drift after N archive/restore
 *     mutations); and
 *   · proves AC9 tenant isolation (B sees zero of A's cells; B's drain touches nothing).
 * Deletes the throwaway users after (orphan reaper takes the workspaces → residue zero).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m22-check.mts
 *
 * M2 is a BOOKED-basis read model — no clock anywhere, so every assertion is
 * clock-independent (unlike the collections/dashboard checks).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { deriveDeal } from "@/lib/deals/compute";
import { dealRpcArgs } from "@/lib/deals/map";
import type { DealInput } from "@/lib/deals/schema";
import { YIELD_AGGREGATE_SELECT, DEAL_SELECT } from "@/lib/supabase/selects";
import {
  buildYieldReport,
  buildPlanningBasis,
  reportFromAggregates,
  planningBasisFromAggregates,
  type YieldAggregateCell,
  type YieldDeal,
} from "@/lib/yield";
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
const SERVICE = E.SUPABASE_SERVICE_ROLE_KEY ?? E.SUPABASE_SECRET_KEY;
const FILE = "discovery/source/ZETA GCI Calculator  Collections v30.20 (1).xlsx";
const RANDOM_MUTATIONS = 60; // archive/restore toggles for the property test

if (!URL_ || URL_ === "PLACEHOLDER_PENDING_CREDENTIALS" || !SERVICE || !ANON) {
  console.log("live-m22 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m22-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m22-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { uid: created.data.user!.id, user };
}

/** Drain the yield consumer to completion; returns total processed + wall-clock ms. */
async function drainYield(user: Client): Promise<{ processed: number; ms: number }> {
  const t0 = Date.now();
  let total = 0;
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc("consume_yield_events", { p_limit: 500 });
    if (error) throw error;
    const p = (data as { processed?: number })?.processed ?? 0;
    total += p;
    if (p === 0) break;
  }
  return { processed: total, ms: Date.now() - t0 };
}

/** Load the materialized cells the way M2.3/M2.4 will (::text money, RLS-scoped). */
async function loadCells(user: Client): Promise<YieldAggregateCell[]> {
  const { data, error } = await user
    .from("yield_aggregate")
    .select(YIELD_AGGREGATE_SELECT)
    .order("segment")
    .order("booked_year");
  if (error) throw error;
  return (data ?? []) as unknown as YieldAggregateCell[];
}

/** Load the raw deals as YieldDeal projections (the M2.1 pure-function input). */
async function loadDeals(user: Client): Promise<YieldDeal[]> {
  const { data, error } = await user.from("deal").select(DEAL_SELECT);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const d = row as Record<string, string | null>;
    return {
      deal_code: d.deal_code as string,
      transaction_type: d.transaction_type as YieldDeal["transaction_type"],
      // DB token n_a → engine token n/a (the classifier never reads n/a positively).
      deal_type: (d.deal_type === "n_a" ? "n/a" : d.deal_type) as YieldDeal["deal_type"],
      representation: d.representation as YieldDeal["representation"],
      list_price: d.list_price as string,
      net_gci: d.net_gci as string,
      incentive_net: d.incentive_net as string,
      referral_out: d.referral_out as string,
      booked_year: Number(d.booked_year),
      archived_at: d.archived_at,
    };
  });
}

async function reconcile(user: Client) {
  const { data, error } = await user.rpc("reconcile_yield_aggregate");
  if (error) throw error;
  return data as { ok: boolean; drift_count: number; drifts: unknown[]; unclassified: string[]; basis_version: number };
}

async function basisVersion(user: Client): Promise<number> {
  const { data } = await user.from("yield_basis_version").select("basis_version").maybeSingle();
  return data ? Number((data as { basis_version: number }).basis_version) : 0;
}

/** The full zero-drift invariant: materialized cells == M2.1 pure functions == SQL reconcile. */
async function assertZeroDrift(user: Client, label: string) {
  const cells = await loadCells(user);
  const deals = await loadDeals(user);
  // The pure report knows unclassified codes; the aggregate passes []. Compare on a
  // normalized copy that drops `unclassified` (there are no unclassified deals in the
  // workbook fixtures anyway — asserted separately via the reconcile below).
  const dropUnclassified = (r: ReturnType<typeof buildYieldReport>) =>
    JSON.stringify({ ...r, unclassified: [] });
  check(`[${label}] aggregate report ties to buildYieldReport (pure)`,
    dropUnclassified(reportFromAggregates(cells, "all")) === dropUnclassified(buildYieldReport(deals, "all")));
  check(`[${label}] aggregate planning basis ties to buildPlanningBasis (pure)`,
    JSON.stringify(planningBasisFromAggregates(cells)) === JSON.stringify(buildPlanningBasis(deals)));
  const rec = await reconcile(user);
  check(`[${label}] SQL reconcile reports ZERO drift`, rec.ok && rec.drift_count === 0, `drift=${rec.drift_count}`);
  check(`[${label}] no unclassified deals (Rule 9 clean)`, rec.unclassified.length === 0, rec.unclassified.join(","));
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain the yield consumer -------------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  const firstDrain = await drainYield(user);
  check("import drain processed the 21 deal events", firstDrain.processed === 21, String(firstDrain.processed));

  // === §9 criterion 1–3 + planning basis, reconstructed FROM the aggregate =====
  const cells = await loadCells(user);
  const report = reportFromAggregates(cells, "all");
  const row = (k: string) => report.rows.find((r) => r.key === k)!;
  check("Resale 7 / 55,251,000.00 / 2,687,550.00 / 4.8643% / 34.69%",
    row("resale").deals === 7 && row("resale").volume === "55251000.00" && row("resale").gci === "2687550.00" &&
    row("resale").realizedYield === "0.048643" && row("resale").shareOfSales === "0.346878",
    `${row("resale").deals}/${row("resale").volume}/${row("resale").gci}/${row("resale").realizedYield}/${row("resale").shareOfSales}`);
  check("Developer 10 / 104,029,945.00 / 3,800,947.25 / 3.6537% / 65.31%",
    row("developer").deals === 10 && row("developer").volume === "104029945.00" && row("developer").gci === "3800947.25" &&
    row("developer").realizedYield === "0.036537", `${row("developer").deals}/${row("developer").volume}/${row("developer").gci}/${row("developer").realizedYield}`);
  check("SALES SUBTOTAL 17 / 159,280,945.00 / 6,488,497.25 / 4.0736%",
    row("sales_subtotal").deals === 17 && row("sales_subtotal").volume === "159280945.00" &&
    row("sales_subtotal").gci === "6488497.25" && row("sales_subtotal").realizedYield === "0.040736",
    `${row("sales_subtotal").deals}/${row("sales_subtotal").volume}/${row("sales_subtotal").gci}/${row("sales_subtotal").realizedYield}`);
  check("Rental 4 / 2,400,000.00 / 200,000.00 / 8.3333% / — share",
    row("rental").deals === 4 && row("rental").volume === "2400000.00" && row("rental").gci === "200000.00" &&
    row("rental").realizedYield === "0.083333" && row("rental").shareOfSales === null,
    `${row("rental").deals}/${row("rental").volume}/${row("rental").gci}/${row("rental").realizedYield}`);
  check("Referral empty (0 / 0.00 / — / —)",
    row("referral").deals === 0 && row("referral").volume === "0.00" && row("referral").realizedYield === null);
  check("footer TOTAL GCI (all ops) 6,688,497.25 / memo incentives 357,142.87 / referral-outs (75,000.00)",
    report.totalGciAllOps === "6688497.25" && report.memoIncentives === "357142.87" && report.memoReferralOuts === "-75000.00",
    `${report.totalGciAllOps}/${report.memoIncentives}/${report.memoReferralOuts}`);
  check("avg prices 7,893,000.00 / 10,402,994.50 / 9,369,467.35 / rental annual 200,000.00",
    report.resaleAvgPrice === "7893000.00" && report.developerAvgPrice === "10402994.50" &&
    report.blendedAvgPrice === "9369467.35" && report.rentalAnnualGci === "200000.00",
    `${report.resaleAvgPrice}/${report.developerAvgPrice}/${report.blendedAvgPrice}`);

  const basis = planningBasisFromAggregates(cells);
  check("PlanningBasis 17 / 159,280,945.00 / 6,488,497.25 full-precision yield 0.0407361800…",
    basis.allTimeSalesDeals === 17 && basis.allTimeSalesVolume === "159280945.00" && basis.allTimeSalesGci === "6488497.25" &&
    basis.allTimeYield!.startsWith("0.04073618"), basis.allTimeYield ?? "null");
  check("PlanningBasis all-time price 9,369,467.3529… → 9,369,467.35",
    basis.allTimePrice!.startsWith("9369467.35") && Number(basis.allTimePrice) > 9369467.35 - 1, basis.allTimePrice ?? "null");
  // §3.4 identity: yield × price = gci ÷ deals = ₱381,676.31 (full precision).
  const fees = (Number(basis.allTimeYield) * Number(basis.allTimePrice)).toFixed(2);
  check("§3.4 identity yield × price = ₱381,676.31 (fees per deal)", fees === "381676.31", fees);

  await assertZeroDrift(user, "import");
  const basisAfterImport = await basisVersion(user);
  check("basis_version bumped on import (sales cells created)", basisAfterImport >= 1, String(basisAfterImport));

  // === Reconcile ALARM actually fires on real drift (not just returns ok) ======
  // Corrupt a materialized cell out-of-band (service role) and prove reconcile
  // catches it loudly, then restore the true value — the drift path is exercised.
  const wsId0 = await wsOf(user);
  await admin.from("yield_aggregate").update({ gci_sum: "999999.99" }).eq("workspace_id", wsId0).eq("segment", "resale").eq("booked_year", 2026);
  const drifted = await reconcile(user);
  check("reconcile ALARM fires on a corrupted cell (ok=false, drift≥1)", !drifted.ok && drifted.drift_count >= 1, `ok=${drifted.ok} drift=${drifted.drift_count}`);
  check("reconcile drift row names the offending Resale/2026 cell",
    drifted.drifts.some((d) => (d as { segment: string; booked_year: number }).segment === "resale" && (d as { booked_year: number }).booked_year === 2026),
    JSON.stringify(drifted.drifts[0] ?? {}));
  await admin.from("yield_aggregate").update({ gci_sum: "2687550.00" }).eq("workspace_id", wsId0).eq("segment", "resale").eq("booked_year", 2026);
  const healed = await reconcile(user);
  check("reconcile back to ZERO drift after restore", healed.ok && healed.drift_count === 0);

  // === Year filter: 2026 ≡ All; 2027 zeros but planning basis unchanged (§4 rule 4) ===
  const r2027 = reportFromAggregates(cells, 2027);
  check("filter 2027 → all rows zero, no errors", r2027.rows.every((r) => r.deals === 0 && r.gci === "0.00" && r.realizedYield === null));
  check("filter 2027 → planning basis STILL 4.0736% (ignores filter)",
    planningBasisFromAggregates(cells).allTimeYield === basis.allTimeYield);

  // === Archive D021 → criterion 8 (≤2 s) =====================================
  const d021 = await user.from("deal").select("id").eq("deal_code", "D021").single();
  const d021Id = (d021.data as { id: string }).id;
  await user.rpc("set_deal_archived", { p_id: d021Id, p_archived: true });
  const archDrain = await drainYield(user);
  check("archive D021 restatement latency ≤ 2 s", archDrain.ms <= 2000, `${archDrain.ms} ms`);
  const cellsArch = await loadCells(user);
  const subArch = reportFromAggregates(cellsArch, "all").rows.find((r) => r.key === "sales_subtotal")!;
  check("archive D021 → SUBTOTAL 16 / 151,280,945.00 / 6,133,905.41 / 4.0546%",
    subArch.deals === 16 && subArch.volume === "151280945.00" && subArch.gci === "6133905.41" && subArch.realizedYield === "0.040546",
    `${subArch.deals}/${subArch.volume}/${subArch.gci}/${subArch.realizedYield}`);
  const basisArch = planningBasisFromAggregates(cellsArch);
  check("archive D021 → AllTimePrice 9,455,059.06", basisArch.allTimePrice!.startsWith("9455059.06"), basisArch.allTimePrice ?? "null");
  await assertZeroDrift(user, "archive-D021");
  const basisVArch = await basisVersion(user);
  check("basis_version bumped on archive (developer cell moved)", basisVArch > basisAfterImport, `${basisAfterImport}→${basisVArch}`);

  // === Restore D021 → criterion-1 values exactly (−old/+new reversibility) =====
  await user.rpc("set_deal_archived", { p_id: d021Id, p_archived: false });
  await drainYield(user);
  const subRestore = reportFromAggregates(await loadCells(user), "all").rows.find((r) => r.key === "sales_subtotal")!;
  check("restore D021 → SUBTOTAL back to 17 / 159,280,945.00 / 6,488,497.25 / 4.0736%",
    subRestore.deals === 17 && subRestore.volume === "159280945.00" && subRestore.gci === "6488497.25" && subRestore.realizedYield === "0.040736",
    `${subRestore.deals}/${subRestore.volume}/${subRestore.gci}`);
  await assertZeroDrift(user, "restore-D021");

  // === Create → edit a synthetic Resale deal (create/edit cell restatement) =====
  const propType = await user.from("property_type").select("id,vat_rule").limit(1).single();
  const leadSrc = await user.from("lead_source").select("id").limit(1).single();
  const taxRow = await user.from("tax_settings").select("*").single();
  const tax = taxRow.data as unknown as TaxSettings;
  const refs = { property_vat_rule: (propType.data as { vat_rule: string }).vat_rule as "threshold" | "always_vat" | "always_exempt", developer_comm_base: null };
  const mkInput = (list: string): DealInput => ({
    booked_date: "2026-07-15", transaction_type: "sale", deal_type: "resale",
    developer_id: null, client_name: "M22 Synthetic", representation: "double_ended",
    property_type_id: (propType.data as { id: string }).id, lead_source_id: (leadSrc.data as { id: string }).id,
    property_details: "M22 Unit", mode_of_payment: "cash", list_price: list, force_vat: false,
    commission_basis: "percent", rate_pct: "0.05", fixed_amount: null, receipt_issued: false,
    incentive_billed: "0", incentive_taxable: null, referral_out_pct: "0", referral_out_fixed: "0", referral_paid: false,
  });
  const inA = mkInput("10000000"); // untaxed resale → gci 500,000
  const created = await user.rpc("create_deal", dealRpcArgs(inA, deriveDeal(inA, refs, tax)) as never);
  if (created.error) throw created.error;
  const synthId = (created.data as { id: string }).id;
  await drainYield(user);
  const resaleAfterCreate = reportFromAggregates(await loadCells(user), "all").rows.find((r) => r.key === "resale")!;
  check("create synthetic resale → Resale row 8 deals, volume +10,000,000, gci +500,000",
    resaleAfterCreate.deals === 8 && resaleAfterCreate.volume === "65251000.00" && resaleAfterCreate.gci === "3187550.00",
    `${resaleAfterCreate.deals}/${resaleAfterCreate.volume}/${resaleAfterCreate.gci}`);
  await assertZeroDrift(user, "create-synthetic");

  const ver = await user.from("deal").select("version").eq("id", synthId).single();
  const inB = mkInput("20000000"); // → gci 1,000,000
  await user.rpc("update_deal", { p_id: synthId, p_expected_version: (ver.data as { version: number }).version, ...dealRpcArgs(inB, deriveDeal(inB, refs, tax)) } as never);
  await drainYield(user);
  const resaleAfterEdit = reportFromAggregates(await loadCells(user), "all").rows.find((r) => r.key === "resale")!;
  check("edit synthetic list 10M→20M → Resale gci restated to 3,687,550.00 (gci_sum moves on edit)",
    resaleAfterEdit.gci === "3687550.00" && resaleAfterEdit.volume === "75251000.00",
    `${resaleAfterEdit.volume}/${resaleAfterEdit.gci}`);
  await assertZeroDrift(user, "edit-synthetic");

  // Archive the synthetic, then HARD-DELETE it (no payments → allowed; its events
  // cascade away) so the workspace is exactly the clean 21-deal workbook again for
  // the idempotency / replay / property phases below.
  await user.rpc("set_deal_archived", { p_id: synthId, p_archived: true });
  await drainYield(user);
  const resaleClean = reportFromAggregates(await loadCells(user), "all").rows.find((r) => r.key === "resale")!;
  check("archive synthetic → Resale back to 7 / 55,251,000.00 / 2,687,550.00",
    resaleClean.deals === 7 && resaleClean.volume === "55251000.00" && resaleClean.gci === "2687550.00",
    `${resaleClean.deals}/${resaleClean.volume}/${resaleClean.gci}`);
  await assertZeroDrift(user, "archive-synthetic");
  await user.rpc("delete_deal", { p_id: synthId });
  await drainYield(user); // no event fires for a hard delete; cells already correct

  // === Idempotency: re-drain is a no-op; cell VALUES identical =================
  // Compare on the value tuple (segment/year/count/sums), not updated_at — a rewrite
  // moves the timestamp without moving the number.
  const norm = (cells: YieldAggregateCell[]) =>
    JSON.stringify(cells.map((c) => [c.segment, c.booked_year, c.deal_count, c.volume_sum, c.gci_sum, c.incentive_net_sum, c.referral_out_sum]));
  const snapshotA = norm(await loadCells(user));
  const reDrain = await drainYield(user);
  check("re-drain processes 0 events (idempotent)", reDrain.processed === 0, String(reDrain.processed));
  check("re-drain leaves cell values identical", norm(await loadCells(user)) === snapshotA);

  // === Replay from cursor 0: reset cursor + clear cells → re-drain → identical ==
  const wsId = await wsOf(user);
  await admin.from("yield_event_cursor").update({ last_occurred_at: "-infinity", last_event_id: null }).eq("workspace_id", wsId);
  await admin.from("yield_aggregate").delete().eq("workspace_id", wsId);
  const replay = await drainYield(user);
  check("replay from cursor 0 re-projects every event", replay.processed >= 21, String(replay.processed));
  check("replay from cursor 0 → cell values identical to pre-reset", norm(await loadCells(user)) === snapshotA);
  await assertZeroDrift(user, "replay-from-0");

  // === Property test: zero drift after N random archive/restore mutations ======
  const allDeals = await user.from("deal").select("id,archived_at");
  const ids = (allDeals.data as { id: string; archived_at: string | null }[]).map((d) => d.id);
  const archivedNow = new Set(
    (allDeals.data as { id: string; archived_at: string | null }[]).filter((d) => d.archived_at !== null).map((d) => d.id)
  );
  let driftClean = true;
  for (let i = 0; i < RANDOM_MUTATIONS; i += 1) {
    const id = ids[(i * 7 + 3) % ids.length]; // deterministic pseudo-shuffle (no Math.random in this harness)
    const archive = !archivedNow.has(id);
    await user.rpc("set_deal_archived", { p_id: id, p_archived: archive });
    if (archive) archivedNow.add(id); else archivedNow.delete(id);
    if (i % 12 === 11 || i === RANDOM_MUTATIONS - 1) {
      await drainYield(user);
      const rec = await reconcile(user);
      if (!rec.ok || rec.drift_count !== 0) driftClean = false;
    }
  }
  check(`property test: ZERO drift across ${RANDOM_MUTATIONS} random archive/restore mutations`, driftClean);

  // Restore every deal → back to the clean workbook, criterion-1 exact again.
  for (const id of archivedNow) await user.rpc("set_deal_archived", { p_id: id, p_archived: false });
  await drainYield(user);
  const subFinal = reportFromAggregates(await loadCells(user), "all").rows.find((r) => r.key === "sales_subtotal")!;
  check("restore-all → SUBTOTAL back to 17 / 6,488,497.25 (property test reversible)",
    subFinal.deals === 17 && subFinal.gci === "6488497.25", `${subFinal.deals}/${subFinal.gci}`);
  await assertZeroDrift(user, "property-restore-all");

  // === AC9 — tenant isolation =================================================
  const b = await makeUser("b");
  uidB = b.uid;
  const userB = b.user;
  const bCells = await loadCells(userB);
  check("AC9: tenant B sees ZERO of A's yield cells", bCells.length === 0, String(bCells.length));
  const bDrain = await drainYield(userB);
  check("AC9: B's drain touches nothing (no deals, processed 0)", bDrain.processed === 0, String(bDrain.processed));
  const bRec = await reconcile(userB);
  check("AC9: B reconcile → zero drift, empty (own empty workspace)", bRec.ok && bRec.drift_count === 0 && bRec.unclassified.length === 0);
  // A's cells are unchanged and still present after B's activity.
  check("AC9: A's cells intact after B activity", (await loadCells(user)).length > 0);
}

async function wsOf(user: Client): Promise<string> {
  const { data } = await user.from("deal").select("workspace_id").limit(1).single();
  return (data as { workspace_id: string }).workspace_id;
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
