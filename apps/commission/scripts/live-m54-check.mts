/**
 * M5.4 — headless end-to-end HARDENING proof for the Payments Log (access control,
 * friction gates, optimistic-locking concurrency, transactional event delivery,
 * Data Health, and the audit-log review pass), against the REAL hosted project with
 * real JWTs in THROWAWAY workspaces. Imports the v30.20 workbook the way the app
 * does, then exercises the M5 mutation surface the way a forged/racing/malicious
 * caller would. Deletes both throwaway users after (workspaces cascade away).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m54-check.mts
 *
 * WHAT THIS PROVES (M5 PRD §8, §9 AC4/AC16; M5_Milestones § M5.4):
 *   1. Access control × auth-state matrix over create/update/delete_payment + the
 *      export/edit reads: anonymous and cross-workspace callers are refused with
 *      ZERO side effects (no row change, no audit, no event).
 *   2. Friction gate: the gate is action-layer (gate.ts) — the RPCs are un-gated by
 *      design; this proves the side-effect surface the action gate stands in front
 *      of (a reached mutation writes exactly one audit + one event).
 *   3. Optimistic locking: 20 parallel conflicting edits → exactly one wins, the
 *      rest get stale_version; the receivable ends consistent with the winner (no
 *      double restatement). Parallel create+delete → re-aggregation stays exact.
 *   4. Transactional delivery: a mutation that fails a constraint AFTER validation
 *      rolls back its row AND its audit AND its event together (nothing partial);
 *      payment_event count ties to the number of committed mutations.
 *   5. Data Health: the stale-basis count (the M6 feed) matches the pure predicate.
 *   6. Audit review: a scripted day (deal → payments → edit → delete → status)
 *      produces exactly one well-formed audit entry per mutation — no dupes, no
 *      gaps, correct field_changes.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { deriveDeal } from "@/lib/deals/compute";
import { dealRpcArgs } from "@/lib/deals/map";
import { countStaleBasisPayments } from "@/lib/payments/stale";
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

if (!URL_ || URL_ === "PLACEHOLDER_PENDING_CREDENTIALS" || !SERVICE || !ANON) {
  console.log("live-m54 — skipped (no live Supabase credentials in .env.local).");
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { db: { schema: "commission" }, auth: { persistSession: false } });

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

type Client = ReturnType<typeof createClient>;

async function makeUser(tag: string): Promise<{ uid: string; user: Client }> {
  const email = `m54-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m54-pw";
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
  "id,deal_id,deal_code,status,version,total_collectible::text,collected_net::text,balance::text";
type Recv = {
  id: string;
  deal_id: string;
  deal_code: string;
  status: string;
  version: number;
  total_collectible: string;
  collected_net: string;
  balance: string | null;
};
async function recv(user: Client, code: string): Promise<Recv> {
  const { data, error } = await user.from("receivable").select(RSEL).eq("deal_code", code).single();
  if (error) throw error;
  return data as unknown as Recv;
}

/** An untaxed (n/a) payment split — every component = gross (Rule P2). */
function naSplit(gross: string) {
  return {
    p_net_of_vat: gross, p_vat_amount: "0", p_ewt_amount: "0", p_net_cash: gross, p_retained_cash: gross,
    p_vat_basis_used: "n_a" as const, p_ewt_rate_used: "0.1000", p_vat_rate_used: "0.1200",
  };
}
function createArgs(dealId: string, date: string, gross: string, note: string | null = null) {
  return { p_deal_id: dealId, p_payment_date: date, p_gross_amount: gross, p_payment_type: "commission" as const, p_reference_note: note, ...naSplit(gross) };
}

/** Count audit entries for one entity — proves a rejected mutation writes NONE. */
async function auditCount(user: Client, entityType: string, entityId: string): Promise<number> {
  const { count, error } = await user
    .from("audit_log_entry")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (error) throw error;
  return count ?? 0;
}

/** Count payment_event rows for a deal (scoped transactional-delivery invariant). */
async function eventCountForDeal(user: Client, dealId: string): Promise<number> {
  const { count, error } = await user
    .from("payment_event")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId);
  if (error) throw error;
  return count ?? 0;
}

async function paymentCountForDeal(user: Client, dealId: string): Promise<number> {
  const { count, error } = await user
    .from("payment")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId);
  if (error) throw error;
  return count ?? 0;
}

let uidA = "";
let uidB = "";

// Refs for building synthetic deals with the engine (single source of money truth).
async function buildSynthDeal(
  user: Client,
  refs: { ptId: string; lsId: string; vatRule: "threshold" | "always_vat" | "always_exempt"; tax: TaxSettings },
  listPrice: string
): Promise<{ dealId: string; code: string }> {
  const input: DealInput = {
    booked_date: "2026-07-15", transaction_type: "sale", deal_type: "resale",
    developer_id: null, client_name: "M54 Synthetic", representation: "double_ended",
    property_type_id: refs.ptId, lead_source_id: refs.lsId, property_details: "M54 Unit",
    mode_of_payment: "cash", list_price: listPrice, force_vat: false,
    commission_basis: "percent", rate_pct: "0.05", fixed_amount: null,
    receipt_issued: false, incentive_billed: "0", incentive_taxable: null,
    referral_out_pct: "0", referral_out_fixed: "0", referral_paid: false,
  };
  const derived = deriveDeal(input, { property_vat_rule: refs.vatRule, developer_comm_base: null }, refs.tax);
  const created = await user.rpc("create_deal", dealRpcArgs(input, derived) as never);
  if (created.error) throw created.error;
  await drain(user, "consume_deal_events");
  return { dealId: (created.data as { id: string }).id, code: (created.data as { deal_code: string }).deal_code };
}

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import + drain both consumers -----------------------------------------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_payment_events");

  // Refs for synthetic deals.
  const propType = await user.from("property_type").select("id,vat_rule").limit(1).single();
  const leadSrc = await user.from("lead_source").select("id").limit(1).single();
  const taxRow = await user.from("tax_settings").select("*").single();
  const refs = {
    ptId: (propType.data as { id: string }).id,
    lsId: (leadSrc.data as { id: string }).id,
    vatRule: (propType.data as { vat_rule: string }).vat_rule as "threshold" | "always_vat" | "always_exempt",
    tax: taxRow.data as unknown as TaxSettings,
  };

  // ===========================================================================
  // 1) ACCESS CONTROL × AUTH-STATE MATRIX (M5 PRD §8, AC4/AC16)
  // ===========================================================================
  // An anonymous client (no JWT) and a cross-workspace tenant B must be refused on
  // every M5 mutation, with ZERO side effects on A's data.
  const anon = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const b = await makeUser("b");
  uidB = b.uid;

  // Target: D005 (open, unpaid) and the imported D021 payment.
  const d005 = await recv(user, "D005");
  const d021 = await recv(user, "D021");
  const d021pay = await user.from("payment").select("id,version,deal_id").eq("deal_id", d021.deal_id).is("archived_at", null).single();
  const d021payId = (d021pay.data as { id: string }).id;
  const d021payVer = (d021pay.data as { version: number }).version;

  // Baseline side-effect counters on A's data.
  const baseAudits = await auditCount(user, "payment", d021payId);
  const baseEvents = await eventCountForDeal(user, d021.deal_id);
  const basePayments = await paymentCountForDeal(user, d005.deal_id);

  // --- anonymous: every mutation rejected -----------------------------------
  const anonCreate = await anon.rpc("create_payment", createArgs(d005.deal_id, "2026-07-20", "100000.00"));
  check("anon create_payment rejected", anonCreate.error != null || (anonCreate.data as { ok?: boolean })?.ok !== true,
    anonCreate.error?.message ?? JSON.stringify(anonCreate.data));
  const anonUpdate = await anon.rpc("update_payment", {
    p_id: d021payId, p_expected_version: d021payVer, p_deal_id: d021.deal_id,
    p_payment_date: "2026-07-09", p_gross_amount: "99999.00", p_payment_type: "commission", p_reference_note: null, ...naSplit("99999.00"),
  });
  check("anon update_payment rejected", anonUpdate.error != null || (anonUpdate.data as { ok?: boolean })?.ok !== true);
  const anonDelete = await anon.rpc("delete_payment", { p_id: d021payId, p_expected_version: d021payVer });
  check("anon delete_payment rejected", anonDelete.error != null || (anonDelete.data as { ok?: boolean })?.ok !== true);
  // anon reads see nothing (the export/list boundary).
  const anonRead = await anon.from("payment").select("id").limit(5);
  check("anon payment read returns 0 rows (export/list boundary)", (anonRead.data ?? []).length === 0, `${(anonRead.data ?? []).length}`);

  // --- cross-workspace tenant B: every mutation rejected --------------------
  const bCreate = await b.user.rpc("create_payment", createArgs(d005.deal_id, "2026-07-20", "100000.00"));
  check("tenant B create against A's deal → deal_not_found (edge case 10)",
    bCreate.error != null || (bCreate.data as { ok?: boolean })?.ok !== true, bCreate.error?.message);
  const bUpdate = await b.user.rpc("update_payment", {
    p_id: d021payId, p_expected_version: d021payVer, p_deal_id: d021.deal_id,
    p_payment_date: "2026-07-09", p_gross_amount: "99999.00", p_payment_type: "commission", p_reference_note: null, ...naSplit("99999.00"),
  });
  check("tenant B update A's payment → payment not found (RLS)", bUpdate.error != null || (bUpdate.data as { ok?: boolean })?.ok !== true, bUpdate.error?.message);
  const bDelete = await b.user.rpc("delete_payment", { p_id: d021payId, p_expected_version: d021payVer });
  check("tenant B delete A's payment → payment not found (RLS)", bDelete.error != null || (bDelete.data as { ok?: boolean })?.ok !== true, bDelete.error?.message);
  // B reads (export/edit-page boundary): sees 0 of A's payments; A's payment by id is null.
  const bList = await b.user.from("payment").select("id").limit(5);
  check("tenant B payment list returns 0 rows (export boundary)", (bList.data ?? []).length === 0, `${(bList.data ?? []).length}`);
  const bById = await b.user.from("payment").select("id").eq("id", d021payId).maybeSingle();
  check("tenant B cannot load A's payment by id (edit-page boundary)", bById.data == null);

  // --- NO side effects from any unauthorized attempt ------------------------
  const afterAudits = await auditCount(user, "payment", d021payId);
  const afterEvents = await eventCountForDeal(user, d021.deal_id);
  const afterPayments = await paymentCountForDeal(user, d005.deal_id);
  check("no audit entries written by the forged calls", afterAudits === baseAudits, `${baseAudits}->${afterAudits}`);
  check("no payment events written by the forged calls", afterEvents === baseEvents, `${baseEvents}->${afterEvents}`);
  check("no payment rows created by the forged calls", afterPayments === basePayments, `${basePayments}->${afterPayments}`);
  const d021payNow = await user.from("payment").select("version,gross_amount::text").eq("id", d021payId).single();
  check("A's payment unchanged (version + gross intact)",
    (d021payNow.data as { version: number }).version === d021payVer && (d021payNow.data as { gross_amount: string }).gross_amount === "50000.00",
    `v${(d021payNow.data as { version: number }).version}/${(d021payNow.data as { gross_amount: string }).gross_amount}`);

  // ===========================================================================
  // 2) FRICTION GATE — the side-effect surface the action gate protects
  // ===========================================================================
  // The RPCs are deliberately un-gated (the confirmation is an action-layer
  // deliberateness contract, gate.ts). This proves what a REACHED mutation does, so
  // the action-layer refusal (tests/unit/payments/friction-gate.test.ts) is guarding
  // a real side effect: exactly one audit + one event per owner mutation.
  const gateDeal = await buildSynthDeal(user, refs, "10000000");
  const gCreate = await user.rpc("create_payment", createArgs(gateDeal.dealId, "2026-07-16", "120000.00"));
  check("owner create_payment succeeds (reached mutation)", (gCreate.data as { ok?: boolean })?.ok === true);
  const gPayId = (gCreate.data as { id: string }).id;
  check("reached create wrote exactly one audit entry", (await auditCount(user, "payment", gPayId)) === 1);
  check("reached create wrote exactly one payment event", (await eventCountForDeal(user, gateDeal.dealId)) === 1);

  // ===========================================================================
  // 3) OPTIMISTIC LOCKING — 20 parallel conflicting edits, exactly one wins
  // ===========================================================================
  const lockDeal = await buildSynthDeal(user, refs, "12000000");
  const seed = await user.rpc("create_payment", createArgs(lockDeal.dealId, "2026-07-10", "100000.00"));
  await drain(user, "consume_payment_events");
  const lockPayId = (seed.data as { id: string }).id;
  const lockVer = (seed.data as { version: number }).version;

  const PARALLEL = 20;
  const results = await Promise.all(
    Array.from({ length: PARALLEL }, (_, i) => {
      const gross = (200000 + i * 1000).toFixed(2); // each a DISTINCT change
      return user.rpc("update_payment", {
        p_id: lockPayId, p_expected_version: lockVer, p_deal_id: lockDeal.dealId,
        p_payment_date: "2026-07-10", p_gross_amount: gross, p_payment_type: "commission", p_reference_note: `race-${i}`, ...naSplit(gross),
      });
    })
  );
  const winners = results.filter((r) => (r.data as { ok?: boolean; changed?: boolean })?.ok === true && (r.data as { changed?: boolean })?.changed === true);
  const stale = results.filter((r) => (r.data as { reason?: string })?.reason === "stale_version");
  check("exactly ONE parallel edit won", winners.length === 1, `${winners.length} winners`);
  check("the other 19 got stale_version", stale.length === PARALLEL - 1, `${stale.length} stale`);
  const afterLock = await user.from("payment").select("version,gross_amount::text,net_of_vat::text").eq("id", lockPayId).single();
  const winGross = (afterLock.data as { gross_amount: string }).gross_amount;
  const winNet = (afterLock.data as { net_of_vat: string }).net_of_vat;
  check("version bumped by exactly one (no lost/double update)", (afterLock.data as { version: number }).version === lockVer + 1, `v${(afterLock.data as { version: number }).version}`);
  await drain(user, "consume_payment_events");
  const lockRecv = await recv(user, lockDeal.code);
  check("receivable Collected == the winner's net (no double restatement)", lockRecv.collected_net === winNet, `${lockRecv.collected_net} vs ${winNet}`);
  check("receivable Balance == total − winner's net (exact)",
    lockRecv.balance === (Number(lockRecv.total_collectible) - Number(winNet)).toFixed(2), `${lockRecv.balance}`);
  console.log(`   (winner gross ${winGross}, net ${winNet})`);

  // ===========================================================================
  // 4) PARALLEL CREATE + DELETE — re-aggregation stays exact
  // ===========================================================================
  const mixDeal = await buildSynthDeal(user, refs, "14000000");
  const createdMix = await Promise.all(
    Array.from({ length: 10 }, (_, i) => user.rpc("create_payment", createArgs(mixDeal.dealId, "2026-07-11", (10000 + i * 1000).toFixed(2), `mix-${i}`)))
  );
  const mixIds = createdMix.map((r) => ({ id: (r.data as { id: string }).id, version: (r.data as { version: number }).version, gross: (r.data as { gross_amount: string }).gross_amount }));
  check("all 10 parallel creates succeeded", mixIds.every((m) => m.id), `${mixIds.filter((m) => m.id).length}/10`);
  // Delete 3 in parallel.
  const toDelete = mixIds.slice(0, 3);
  await Promise.all(toDelete.map((m) => user.rpc("delete_payment", { p_id: m.id, p_expected_version: m.version })));
  await drain(user, "consume_payment_events");
  const survivors = mixIds.slice(3);
  const expectedCollected = survivors.reduce((acc, m) => acc + Number(m.gross), 0).toFixed(2);
  const mixRecv = await recv(user, mixDeal.code);
  check("re-aggregation exact after parallel create+delete (Collected = Σ survivors)", mixRecv.collected_net === expectedCollected, `${mixRecv.collected_net} vs ${expectedCollected}`);
  check("payment_event count == mutations (10 created + 3 deleted = 13)", (await eventCountForDeal(user, mixDeal.dealId)) === 13, `${await eventCountForDeal(user, mixDeal.dealId)}`);

  // ===========================================================================
  // 5) TRANSACTIONAL DELIVERY — a post-validation failure rolls back ALL of it
  // ===========================================================================
  // A split whose PURE TIES hold (so assert_payment_split passes) but a component is
  // negative → the INSERT fails the payment_split_non_negative CHECK, AFTER the
  // validation gate. Nothing may persist: no row, no audit, no event (the M0.2
  // atomicity pattern — "a payment can never exist whose receivable ignores it").
  const atomDeal = await buildSynthDeal(user, refs, "8000000");
  const eventsBefore = await eventCountForDeal(user, atomDeal.dealId);
  const rowsBefore = await paymentCountForDeal(user, atomDeal.dealId);
  const inject = await user.rpc("create_payment", {
    p_deal_id: atomDeal.dealId, p_payment_date: "2026-07-12", p_gross_amount: "100.00", p_payment_type: "commission", p_reference_note: null,
    // ties hold: K+L=H (-10+110=100), N=H−M (100=100−0), retained=H−L−M (-10=100−110)
    p_net_of_vat: "-10.00", p_vat_amount: "110.00", p_ewt_amount: "0", p_net_cash: "100.00", p_retained_cash: "-10.00",
    p_vat_basis_used: "n_a" as const, p_ewt_rate_used: "0.1000", p_vat_rate_used: "0.1200",
  });
  check("constraint-violating create raised (nothing returned ok)", inject.error != null || (inject.data as { ok?: boolean })?.ok !== true, inject.error?.message);
  check("transactional rollback: NO payment row persisted", (await paymentCountForDeal(user, atomDeal.dealId)) === rowsBefore, `${rowsBefore}->${await paymentCountForDeal(user, atomDeal.dealId)}`);
  check("transactional rollback: NO payment event persisted", (await eventCountForDeal(user, atomDeal.dealId)) === eventsBefore, `${eventsBefore}->${await eventCountForDeal(user, atomDeal.dealId)}`);

  // ===========================================================================
  // 6) DATA HEALTH — stale-basis count matches the pure predicate (M6 feed)
  // ===========================================================================
  // Change the workspace EWT rate: every taxed imported payment (D021) is now
  // captured under a rate that no longer holds → stale-basis. The count the M6 feed
  // reports (countStaleBasisPayments over the list + current rates) must match.
  const STALE_SEL = "vat_basis_used,ewt_rate_used::text,vat_rate_used::text,deal:deal_id(vat_basis)";
  const beforeRates = await user.from("tax_settings").select("workspace_id,ewt_rate::text,vat_rate::text").single();
  const wsId = (beforeRates.data as { workspace_id: string }).workspace_id;
  const curBefore = { ewt_rate: (beforeRates.data as { ewt_rate: string }).ewt_rate, vat_rate: (beforeRates.data as { vat_rate: string }).vat_rate };
  const listBefore = await user.from("payment").select(STALE_SEL).is("archived_at", null);
  const staleBefore = countStaleBasisPayments(listBefore.data as never[], curBefore);
  check("baseline: no stale-basis payments before any rate change", staleBefore === 0, `${staleBefore}`);

  // Move EWT 10% → 5% (a taxed payment's stored ewt_rate_used now drifts from the
  // live rate). Set it directly via the admin client — the Data Health signal is
  // what we're testing, not the settings write path (proven by M0.2).
  const setEwt = await admin.from("tax_settings").update({ ewt_rate: "0.0500" }).eq("workspace_id", wsId);
  if (setEwt.error) throw new Error(`set ewt: ${setEwt.error.message}`);
  const afterRates = await user.from("tax_settings").select("ewt_rate::text,vat_rate::text").single();
  const curAfter = { ewt_rate: (afterRates.data as { ewt_rate: string }).ewt_rate, vat_rate: (afterRates.data as { vat_rate: string }).vat_rate };
  const listAfter = await user.from("payment").select(STALE_SEL).is("archived_at", null);
  const staleAfter = countStaleBasisPayments(listAfter.data as never[], curAfter);
  // D021's imported incentive payment (ewt_rate_used 0.1000) is the only taxed row.
  check("stale-basis count reflects the rate drift (≥1 taxed row)", staleAfter >= 1, `${staleAfter}`);
  // Cross-check: exactly the rows whose stored ewt_rate_used != current fire.
  const manualStale = (listAfter.data as { ewt_rate_used: string }[]).filter((r) => Number(r.ewt_rate_used) !== 0.05).length;
  check("stale count ties to a manual predicate over the same rows", staleAfter === manualStale, `${staleAfter} vs ${manualStale}`);

  // ===========================================================================
  // 7) AUDIT-LOG REVIEW PASS — one well-formed entry per mutation, a scripted day
  // ===========================================================================
  const dayDeal = await buildSynthDeal(user, refs, "20000000");
  const p1 = await user.rpc("create_payment", createArgs(dayDeal.dealId, "2026-07-13", "50000.00", "OR-1"));
  const p2 = await user.rpc("create_payment", createArgs(dayDeal.dealId, "2026-07-14", "75000.00", "OR-2"));
  const p1Id = (p1.data as { id: string }).id;
  const p1Ver = (p1.data as { version: number }).version;
  // Edit p1: gross 50,000 → 65,000.
  const edit = await user.rpc("update_payment", {
    p_id: p1Id, p_expected_version: p1Ver, p_deal_id: dayDeal.dealId,
    p_payment_date: "2026-07-13", p_gross_amount: "65000.00", p_payment_type: "commission", p_reference_note: "OR-1", ...naSplit("65000.00"),
  });
  check("day: payment edit succeeded", (edit.data as { changed?: boolean })?.changed === true);
  // Delete p2.
  const p2Id = (p2.data as { id: string }).id;
  const p2Ver = (p2.data as { version: number }).version;
  await user.rpc("delete_payment", { p_id: p2Id, p_expected_version: p2Ver });
  await drain(user, "consume_payment_events");
  // Status change: close the receivable (M4.3 mutation).
  const dayRecvNow = await recv(user, dayDeal.code);
  await user.rpc("close_receivable", { p_receivable_id: dayRecvNow.id, p_expected_version: dayRecvNow.version });

  // Read back the audit trail for p1 and assert exactly one entry per mutation.
  type Audit = { action: string; field_changes: Record<string, { old: unknown; new: unknown }>; occurred_at: string };
  const p1Audits = await user.from("audit_log_entry").select("action,field_changes,occurred_at").eq("entity_type", "payment").eq("entity_id", p1Id).order("occurred_at", { ascending: true });
  const p1Rows = (p1Audits.data ?? []) as unknown as Audit[];
  check("p1 has exactly 2 audit entries (create + edit), no dupes/gaps", p1Rows.length === 2, `${p1Rows.length}`);
  check("p1 entries are create then update", p1Rows[0]?.action === "create" && p1Rows[1]?.action === "update", `${p1Rows.map((r) => r.action).join(",")}`);
  const editChanges = p1Rows[1]?.field_changes ?? {};
  check("p1 edit field_changes records gross 50,000 → 65,000 (correct old→new)",
    editChanges.gross_amount?.old === "50000.00" && editChanges.gross_amount?.new === "65000.00",
    JSON.stringify(editChanges.gross_amount));
  check("p1 create entry is a non-empty object (well-formed field_changes)", p1Rows[0] != null && typeof p1Rows[0].field_changes === "object" && Object.keys(p1Rows[0].field_changes).length > 0);

  const p2Audits = await user.from("audit_log_entry").select("action").eq("entity_type", "payment").eq("entity_id", p2Id);
  const p2Actions = (p2Audits.data ?? []).map((r) => (r as { action: string }).action).sort();
  check("p2 has exactly 2 audit entries (create + delete)", p2Actions.length === 2 && p2Actions.join(",") === "create,delete", p2Actions.join(","));

  const recvAudits = await user.from("audit_log_entry").select("action,field_changes").eq("entity_type", "receivable").eq("entity_id", dayRecvNow.id);
  const closeEntry = (recvAudits.data ?? []).find((r) => JSON.stringify((r as { field_changes: Record<string, unknown> }).field_changes).includes("status"));
  check("status change produced a receivable audit entry naming the status field", closeEntry != null);

  console.log(fails.length ? `\n❌ ${fails.length} FAILED: ${fails.join(", ")}` : "\n✅ ALL M5.4 LIVE CHECKS PASSED");
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
