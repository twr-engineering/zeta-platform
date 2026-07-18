/**
 * M7.3 — headless end-to-end EDGE HARDENING proof for Source Performance, against
 * the REAL hosted project with real JWTs in a THROWAWAY workspace. Imports the
 * v30.20 workbook the way the app does, then drives the report through everything
 * Settings and the deal ledger can do to it, running the SAME pure builder the app
 * ships (sourcePerformance) over the RLS-scoped receivables + M0 lead-source list —
 * exactly what getSourcePerformance composes on read.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m73-check.mts
 *
 * WHAT THIS PROVES (M7 PRD §4 rules 1/2/7/12, §9 AC4–7/10; Milestones § M7.3):
 *   • EC18 — a lead-source RENAME propagates to the row label on the next read (one
 *     continuous row, no orphan, no leftover) and the deal history is intact;
 *     ARCHIVE re-labels "(inactive)" with figures unchanged; RESTORE reverts.
 *   • EC19 — the year filter is a BOOKED lens: a deal booked 2025 and paid 2026
 *     appears in the 2025 lens WITH its collected cash and is ABSENT from 2026.
 *   • Cancelled-with-partial — a real deal + partial payment + cancel_receivable →
 *     the source row keeps the REAL cash collected, Outstanding excludes the
 *     written-off balance, % Collected stays honest (§4 rule 7 divergence).
 *   • Freshness (§4 rule 12) — the report is COMPUTE-ON-READ: a new payment / a
 *     status change reflects on the very next read with no cache to invalidate.
 *   • AC9 — cross-tenant isolation holds throughout.
 *
 * Clock-independent (M7 is a booked-basis report). Self-skips on placeholder creds.
 * Deletes the throwaway users after (the membership-delete trigger reaps the
 * workspaces → delta-residue zero).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";
import { deriveDeal } from "@/lib/deals/compute";
import { dealRpcArgs } from "@/lib/deals/map";
import { RECEIVABLE_SELECT, LEAD_SOURCE_SELECT } from "@/lib/supabase/selects";
import {
  sourcePerformance,
  distinctBookedYears,
  type SourceLeadSource,
  type SourcePerformanceReport,
} from "@/lib/source-performance/build";
import type { DealInput } from "@/lib/deals/schema";
import type { TaxSettings } from "@/types/entities";
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
  console.log("live-m73 — skipped (no live Supabase credentials in .env.local).");
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
  const email = `m73-${tag}-${Date.now()}@throwaway.test`;
  const password = "throwaway-m73-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
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

/** Compose the report exactly as getSourcePerformance does — a fresh read each time. */
async function report(user: Client, year: number | "all"): Promise<SourcePerformanceReport> {
  const [receivables, sources] = await Promise.all([loadReceivables(user), loadLeadSources(user)]);
  return sourcePerformance(receivables, sources, year);
}

const RSEL = "id,deal_id,deal_code,status,version,booked_net_gci::text,total_collectible::text,collected_net::text,balance::text,written_off::text";
type Recv = { id: string; deal_id: string; deal_code: string; status: string; version: number; booked_net_gci: string; total_collectible: string; collected_net: string; balance: string | null; written_off: string | null };
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
function payArgs(dealId: string, date: string, gross: string, note: string | null = null) {
  return { p_deal_id: dealId, p_payment_date: date, p_gross_amount: gross, p_payment_type: "commission" as const, p_reference_note: note, ...naSplit(gross) };
}

async function wsOf(user: Client): Promise<string> {
  const { data } = await user.from("receivable").select("workspace_id").limit(1).single();
  return (data as { workspace_id: string }).workspace_id;
}

/** Build a synthetic deal through the real create_deal → event → receivable pipeline. */
async function makeDeal(
  user: Client,
  refs: { ptId: string; lsId: string; vatRule: "threshold" | "always_vat" | "always_exempt"; tax: TaxSettings },
  overrides: Partial<DealInput>
): Promise<{ dealId: string; code: string }> {
  const input: DealInput = {
    booked_date: "2026-07-15", transaction_type: "rental", deal_type: "n_a",
    developer_id: null, client_name: "M73 Synthetic", representation: "lessor",
    property_type_id: refs.ptId, lead_source_id: refs.lsId, property_details: "M73 Unit",
    mode_of_payment: "cash", list_price: "1200000.00", force_vat: false,
    commission_basis: "fixed", rate_pct: null, fixed_amount: "500000.00",
    receipt_issued: false, incentive_billed: "0", incentive_taxable: null,
    referral_out_pct: "0", referral_out_fixed: "0", referral_paid: false,
    ...overrides,
  };
  const derived = deriveDeal(input, { property_vat_rule: refs.vatRule, developer_comm_base: null }, refs.tax);
  const created = await user.rpc("create_deal", dealRpcArgs(input, derived) as never);
  if (created.error) throw created.error;
  await drain(user, "consume_deal_events");
  return { dealId: (created.data as { id: string }).id, code: (created.data as { deal_code: string }).deal_code };
}

let uidA = "";
let uidB = "";

async function main() {
  const a = await makeUser("a");
  uidA = a.uid;
  const user = a.user;

  // --- import the real workbook, drain both consumers as the app does --------
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  await drain(user, "consume_payment_events");

  const ws = await wsOf(user);
  const base = await report(user, "all");
  check("baseline: §9 TOTAL Booked ties (6,688,497.25) — the report reads live", base.total.bookedNetGci === "6688497.25", base.total.bookedNetGci);

  // === EC18: rename propagates on next read, history intact ==================
  const ytBefore = base.rows.find((r) => r.source === "YouTube")!;
  await admin.from("lead_source").update({ name: "YouTube Organic" }).eq("workspace_id", ws).eq("name", "YouTube");
  const afterRename = await report(user, "all");
  const ytAfter = afterRename.rows.find((r) => r.leadSourceId === ytBefore.leadSourceId)!;
  check(
    "EC18 rename: same 7 deals / ₱2,455,541.29 now under 'YouTube Organic' (one row, no orphan/leftover)",
    ytAfter.source === "YouTube Organic" &&
      ytAfter.deals === 7 &&
      ytAfter.bookedNetGci === "2455541.29" &&
      afterRename.rows.filter((r) => r.leadSourceId === ytBefore.leadSourceId).length === 1 &&
      !afterRename.rows.some((r) => r.source === "YouTube"),
    `${ytAfter.source}/${ytAfter.deals}/${ytAfter.bookedNetGci}`
  );
  check("EC18 rename: deal history intact — TOTAL still ties (no NET GCI dropped)", afterRename.total.bookedNetGci === "6688497.25");
  // restore the name
  await admin.from("lead_source").update({ name: "YouTube" }).eq("workspace_id", ws).eq("id", ytBefore.leadSourceId);

  // === EC18: archive-with-deals → "(inactive)"; restore reverts ==============
  await admin.from("lead_source").update({ archived_at: "2026-07-01T00:00:00Z" }).eq("workspace_id", ws).eq("name", "Lamudi");
  const archived = await report(user, "all");
  const lam = archived.rows.find((r) => r.source === "Lamudi (inactive)");
  check(
    "EC18 archive: Lamudi (2 deals) → 'Lamudi (inactive)', figures unchanged (₱863,003.13)",
    !!lam && lam.archived === true && lam.deals === 2 && lam.bookedNetGci === "863003.13",
    `${lam?.source}/${lam?.deals}/${lam?.bookedNetGci}`
  );
  await admin.from("lead_source").update({ archived_at: null }).eq("workspace_id", ws).eq("name", "Lamudi");
  const restored = await report(user, "all");
  check("EC18 restore: back to bare 'Lamudi' label, still 2 deals", restored.rows.some((r) => r.source === "Lamudi" && r.deals === 2));

  // === Refs for synthetic deals ==============================================
  const propType = await user.from("property_type").select("id,vat_rule").limit(1).single();
  const leadSrc = await user.from("lead_source").select("id").eq("name", "Website").single();
  const taxRow = await user.from("tax_settings").select("*").single();
  const refs = {
    ptId: (propType.data as { id: string }).id,
    lsId: (leadSrc.data as { id: string }).id, // "Website" — a zero-deal source in the fixture
    vatRule: (propType.data as { vat_rule: string }).vat_rule as "threshold" | "always_vat" | "always_exempt",
    tax: taxRow.data as unknown as TaxSettings,
  };

  // === EC19: booked 2025, paid 2026 → 2025 lens has the cash, 2026 does not ===
  // Booked NET GCI is engine-derived (VAT depends on settings) — read it from the
  // receivable and assert RELATIONSHIPS; the injected n_a payments are deterministic
  // cash (net-of-VAT = gross), and with no referral/override collectible == booked.
  const xyear = await makeDeal(user, refs, { booked_date: "2025-03-10", client_name: "EC19 Cross-year" });
  const xRecv = await recv(user, xyear.code);
  const xBooked = xRecv.booked_net_gci;
  // Pay it in 2026 (payment year ≠ booking year).
  const pay25 = await user.rpc("create_payment", payArgs(xyear.dealId, "2026-04-01", "120000.00", "EC19 partial"));
  if (pay25.error) throw pay25.error;
  await drain(user, "consume_payment_events");

  const outAfter120 = (Number(xRecv.total_collectible) - 120000).toFixed(2);
  const y2025 = await report(user, 2025);
  const webRow25 = y2025.rows.find((r) => r.leadSourceId === refs.lsId)!;
  check(
    `EC19: 2025 lens shows the cross-year deal WITH its 2026 cash (collected ₱120,000.00 on booked ₱${xBooked})`,
    webRow25.deals === 1 && webRow25.bookedNetGci === xBooked && webRow25.collectedNet === "120000.00" && webRow25.outstandingNet === outAfter120,
    `${webRow25.deals}/${webRow25.bookedNetGci}/${webRow25.collectedNet}/out ${webRow25.outstandingNet}`
  );
  const y2026 = await report(user, 2026);
  const webRow26 = y2026.rows.find((r) => r.leadSourceId === refs.lsId);
  check(
    "EC19: 2026 lens EXCLUDES the 2025-booked deal (its cash does not leak into 2026)",
    !webRow26 || webRow26.deals === 0,
    `2026 Website deals=${webRow26?.deals ?? 0}`
  );
  check("EC19: FR-M7-02 year dropdown now offers 2025 too (a year with ≥1 booked deal)", distinctBookedYears(await loadReceivables(user)).includes(2025));

  // === Freshness (§4 rule 12): a NEW payment reflects on the next read =======
  const before = webRow25.collectedNet;
  const pay2 = await user.rpc("create_payment", payArgs(xyear.dealId, "2026-05-01", "80000.00", "EC freshness"));
  if (pay2.error) throw pay2.error;
  await drain(user, "consume_payment_events");
  const y2025b = await report(user, 2025);
  const webRow25b = y2025b.rows.find((r) => r.leadSourceId === refs.lsId)!;
  const outAfter200 = (Number(xRecv.total_collectible) - 200000).toFixed(2);
  check(
    "Freshness: a new ₱80,000 payment reflects on the very next read (compute-on-read, no cache) — collected 120,000 → 200,000",
    before === "120000.00" && webRow25b.collectedNet === "200000.00" && webRow25b.outstandingNet === outAfter200,
    `${before} → ${webRow25b.collectedNet} · out ${webRow25b.outstandingNet}`
  );

  // === Cancelled-with-partial regression =====================================
  // A fresh deal booked 2026, partially paid, then cancelled → the row keeps the
  // real cash, Outstanding drops to 0, % Collected honest (NOT the sheet's 100%).
  const cancel = await makeDeal(user, refs, { client_name: "Cancelled partial", fixed_amount: "500000.00", booked_date: "2026-08-01" });
  const cRecv = await recv(user, cancel.code);
  const cBooked = cRecv.booked_net_gci;
  const cCollectible = cRecv.total_collectible;
  const payC = await user.rpc("create_payment", payArgs(cancel.dealId, "2026-08-10", "100000.00", "partial then cancel"));
  if (payC.error) throw payC.error;
  await drain(user, "consume_payment_events");
  const cRecvPaid = await recv(user, cancel.code);
  const cancelRes = await user.rpc("cancel_receivable", { p_receivable_id: cRecvPaid.id, p_expected_version: cRecvPaid.version, p_reason: "Buyer backed out after partial collection" });
  if (cancelRes.error) throw cancelRes.error;
  check("cancel_receivable succeeded", (cancelRes.data as { ok?: boolean })?.ok === true);
  await drain(user, "consume_payment_events");

  const cRecvAfter = await recv(user, cancel.code);
  const y2026c = await report(user, 2026);
  // The cancelled deal is on "Website" alongside no other 2026 Website deal.
  const webCancel = y2026c.rows.find((r) => r.leadSourceId === refs.lsId)!;
  const honestPct = (100000 / Number(cBooked)).toFixed(6);
  const writtenOffExpected = (Number(cCollectible) - 100000).toFixed(2);
  check(
    `cancelled-with-partial: receivable cancelled, cash 100,000 kept, remainder written off (₱${writtenOffExpected}, Rule O)`,
    cRecvAfter.status === "cancelled" && cRecvAfter.collected_net === "100000.00" && cRecvAfter.written_off === writtenOffExpected,
    `status=${cRecvAfter.status} collected=${cRecvAfter.collected_net} written_off=${cRecvAfter.written_off}`
  );
  check(
    `cancelled-with-partial: source row keeps real cash 100,000, Outstanding +0, % Collected honest ${honestPct} (NOT the sheet's 1.0)`,
    webCancel.collectedNet === "100000.00" && webCancel.outstandingNet === "0.00" && webCancel.bookedNetGci === cBooked && webCancel.pctCollected === honestPct,
    `booked=${webCancel.bookedNetGci} collected=${webCancel.collectedNet} out=${webCancel.outstandingNet} pct=${webCancel.pctCollected}`
  );
  check(
    "cancelled-with-partial: the sheet's Booked − Outstanding would over-claim the full booked as collected (rule-7 divergence documented)",
    (Number(webCancel.bookedNetGci) - Number(webCancel.outstandingNet)).toFixed(2) === cBooked && webCancel.collectedNet !== cBooked
  );

  // === Freshness on a status change: reopening restates Outstanding ==========
  const reopen = await user.rpc("reopen_receivable", { p_receivable_id: cRecvAfter.id, p_expected_version: cRecvAfter.version });
  if (reopen.error) throw reopen.error;
  await drain(user, "consume_payment_events");
  const y2026d = await report(user, 2026);
  const webReopened = y2026d.rows.find((r) => r.leadSourceId === refs.lsId)!;
  const reopenedOut = (Number(cCollectible) - 100000).toFixed(2);
  check(
    `Freshness: reopening the cancelled receivable restates Outstanding on next read (0 → ${reopenedOut} owed)`,
    webReopened.outstandingNet === reopenedOut && webReopened.collectedNet === "100000.00",
    `out=${webReopened.outstandingNet} collected=${webReopened.collectedNet}`
  );

  // === AC9: cross-tenant isolation ===========================================
  // A now carries the workbook 21 deals + the synthetic EC19/cancel deals; capture
  // A's current all-years total, then prove B reads none of it and A is unchanged.
  const aBefore = await report(user, "all");
  const b = await makeUser("b");
  uidB = b.uid;
  const reportB = await report(b.user, "all");
  check("AC9: tenant B sees 0 of A's deals (TOTAL 0 / booked 0.00)", reportB.total.deals === 0 && reportB.total.bookedNetGci === "0.00", `${reportB.total.deals}/${reportB.total.bookedNetGci}`);
  const aStill = await report(user, "all");
  check(
    "AC9: tenant A intact after B read (same deals & Booked as before B existed)",
    aStill.total.deals === aBefore.total.deals && aStill.total.bookedNetGci === aBefore.total.bookedNetGci && aStill.total.bookedNetGci !== "0.00",
    `${aStill.total.deals} deals / ${aStill.total.bookedNetGci}`
  );
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
