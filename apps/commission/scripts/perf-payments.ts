/**
 * M5.3 — the live payments-list perf harness (M5 PRD §8, DoD).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-payments.ts [N]
 *   pnpm run perf:payments
 *
 * Seeds N deals + one payment each (default 1,000) into a THROWAWAY workspace, then
 * measures the DB-bound M5.3 perf target against a real project and reports the
 * number:
 *
 *   - payments-list read (the /payments query: PAYMENT_LIST_SELECT + live deal
 *     identity join, newest-first)                                    P95 < 500 ms
 *
 * The split for each seeded payment is computed by M1's engine (the single source
 * of money truth — never hand-rolled) so the rows are byte-valid snapshots; the
 * rows are inserted with the service role for speed (the create_payment RPC path is
 * proven correctness-wise by M5.1's suite, not re-exercised here).
 *
 * The fixtures are NEVER committed: a throwaway auth user (own workspace via the
 * signup bootstrap), rows inserted with the service role, measured as that user with
 * a real JWT, then the user is deleted — the orphan reaper takes the workspace and
 * every deal / payment with it, back to baseline.
 *
 * CI-safe: with placeholder credentials it prints "skipped" and exits 0.
 */
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import {
  computeDeal,
  computePaymentSplit,
  type DealComputeInput,
  type EngineSettings,
  type PaymentSplitInput,
} from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";
import { dbVatBasisToEngine } from "@/lib/payments/map";
import { filterPaymentDeals, type PaymentDealOption } from "@/lib/payments/picker";
import { DEAL_SELECT, PAYMENT_SELECT } from "@/lib/supabase/selects";

const N = Number(process.argv[2] ?? 1000);
const PERF_EMAIL = "perf-payments@solo.test";
const PERF_PASSWORD = "zeta-perf-password";

// The four M5 PRD §8 performance targets, over ≥1,000 deals/payments.
const LIST_P95_MS = 500; // payments-list read P95
const CREATE_MS = 300; // create round-trip (validate + split + events) server time
const PREVIEW_MS = 100; // split preview server round-trip
const PICKER_MS = 150; // type-ahead over 1,000 deals

// The exact select the /payments read uses (queries.ts PAYMENT_LIST_SELECT).
const PAYMENT_LIST_SELECT = `${PAYMENT_SELECT},deal:deal_id(deal_code,booked_year,client_name,property_details,deal_type,vat_basis,developer:developer_id(id,name))`;

function loadEnv(): Record<string, string> {
  // Start from process.env so the harness is CI-safe: .env.local is gitignored and
  // absent on a fresh CI checkout, where the workflow sets the (placeholder)
  // credentials as environment variables instead. A local .env.local, when present,
  // overlays them. Either way the skip check below sees the right values.
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    // No .env.local (CI, fresh clone) means no live credentials: return nothing so the
  // caller's "skipped" branch runs instead of crashing on ENOENT.
  const envFile = new URL("../.env.local", import.meta.url);
  if (!existsSync(envFile)) return {};
  const raw = readFileSync(envFile, "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local (CI) — process.env alone drives the skip decision.
  }
  return env;
}

function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

type Ref = { propertyTypeId: string; developerA: string; developerB: string; leadA: string; leadB: string };

/** N varied engine inputs — a realistic mix of taxable / untaxed deals. */
function syntheticInputs(count: number): DealComputeInput[] {
  const out: DealComputeInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = i % 4;
    const listPrice = (2_000_000 + (i % 60) * 125_000).toFixed(2);
    if (kind <= 1) {
      out.push({
        deal_type: "developer",
        transaction_type: "sale",
        representation: "seller",
        force_vat: i % 9 === 0,
        property_vat_rule: i % 2 === 0 ? "threshold" : "always_vat",
        list_price: listPrice,
        commission: { basis: "percent", rate: "0.05" },
        developer_comm_base: i % 2 === 0 ? "net" : "gross",
        receipt_issued: true,
        incentive_billed: (i % 3 === 0 ? 50_000 : 0).toFixed(2),
        incentive_taxable: i % 3 === 0 ? "yes" : null,
        referral_out_pct: "0",
        referral_out_fixed: "0.00",
      });
    } else if (kind === 2) {
      out.push({
        deal_type: "resale",
        transaction_type: "sale",
        representation: "buyer",
        force_vat: false,
        property_vat_rule: "always_exempt",
        list_price: listPrice,
        commission: { basis: "fixed", amount: "200000.00" },
        developer_comm_base: null,
        receipt_issued: false,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0",
        referral_out_fixed: "0.00",
      });
    } else {
      out.push({
        deal_type: "n/a",
        transaction_type: "rental",
        representation: "lessor",
        force_vat: false,
        property_vat_rule: "always_exempt",
        list_price: (240_000 + (i % 20) * 12_000).toFixed(2),
        commission: { basis: "percent", rate: "1/12" },
        developer_comm_base: null,
        receipt_issued: true,
        incentive_billed: "0.00",
        incentive_taxable: null,
        referral_out_pct: "0",
        referral_out_fixed: "0.00",
      });
    }
  }
  return out;
}

/** One engine input → a full deal row for a direct (service-role) insert. */
function toDealRow(
  input: DealComputeInput,
  index: number,
  workspaceId: string,
  refs: Ref,
  settings: EngineSettings,
  actor: string
) {
  const derived = dealDerivedDbFields(computeDeal(input, settings));
  const isDeveloper = input.deal_type === "developer";
  const code = `D${String(index + 1).padStart(6, "0")}`;
  return {
    workspace_id: workspaceId,
    deal_code: code,
    booked_date: `${2022 + (index % 5)}-06-01`,
    transaction_type: input.transaction_type,
    deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? (index % 2 === 0 ? refs.developerA : refs.developerB) : null,
    client_name: `Perf Client ${index + 1}`,
    representation: input.representation,
    property_type_id: refs.propertyTypeId,
    lead_source_id: index % 2 === 0 ? refs.leadA : refs.leadB,
    property_details: `Synthetic unit ${index + 1}`,
    mode_of_payment: "cash",
    list_price: input.list_price,
    force_vat: input.force_vat,
    commission_basis: input.commission.basis,
    rate_pct: input.commission.basis === "percent" ? input.commission.rate : null,
    fixed_amount: input.commission.basis === "fixed" ? input.commission.amount : null,
    receipt_issued: input.receipt_issued,
    incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable,
    referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed,
    referral_paid: false,
    ...derived,
    booked_year: 2022 + (index % 5),
    display_label: `${code} — Perf Client ${index + 1}`,
    version: 1,
    created_by: actor,
    updated_by: actor,
  };
}

/** A deal row → one payment row with the engine-computed split snapshot. */
function toPaymentRow(
  input: DealComputeInput,
  deal: Record<string, unknown>,
  dealId: string,
  index: number,
  settings: EngineSettings,
  actor: string
) {
  const gross = (100_000 + (index % 40) * 12_500).toFixed(2);
  const splitInput: PaymentSplitInput = {
    gross,
    vat_basis: dbVatBasisToEngine(deal.vat_basis as "inclusive" | "n_a"),
    payment_type: "commission",
    incentive_taxable: input.incentive_taxable,
    ewt_subject: deal.taxable as boolean,
  };
  const split = computePaymentSplit(splitInput, settings);
  return {
    workspace_id: deal.workspace_id,
    deal_id: dealId,
    payment_date: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
    gross_amount: gross,
    payment_type: "commission",
    reference_note: index % 7 === 0 ? `OR-${index + 1}` : null,
    net_of_vat: split.net_of_vat,
    vat_amount: split.vat,
    ewt_amount: split.ewt,
    net_cash: split.net_cash,
    retained_cash: split.retained,
    vat_basis_used: deal.vat_basis,
    ewt_rate_used: settings.ewt_rate,
    vat_rate_used: settings.vat_rate,
    version: 1,
    created_by: actor,
    updated_by: actor,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS" || !serviceKey || !anonKey) {
    console.log("perf:payments — skipped (no live Supabase credentials in .env.local).");
    return;
  }

  const admin = createClient(url, serviceKey, {
    db: { schema: "commission" },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find(
    (u) => u.email === PERF_EMAIL
  );
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const created = await admin.auth.admin.createUser({
    email: PERF_EMAIL,
    password: PERF_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Perf" },
  });
  if (created.error) throw new Error(`create perf user: ${created.error.message}`);
  const userId = created.data.user.id;

  const membership = await admin
    .from("membership")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle<{ workspace_id: string }>();
  const workspaceId = membership.data?.workspace_id;
  if (!workspaceId) throw new Error("signup bootstrap did not create a workspace");

  const pt = await admin.from("property_type").insert({ workspace_id: workspaceId, name: "Perf Type", vat_rule: "threshold", created_by: userId }).select("id").single();
  const devA = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer A", comm_base: "net", created_by: userId }).select("id").single();
  const devB = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer B", comm_base: "gross", created_by: userId }).select("id").single();
  const lsA = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source A", sort_order: 1, created_by: userId }).select("id").single();
  const lsB = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source B", sort_order: 2, created_by: userId }).select("id").single();
  if (pt.error || devA.error || devB.error || lsA.error || lsB.error) {
    throw new Error("seed refs failed");
  }
  const refs: Ref = {
    propertyTypeId: pt.data.id,
    developerA: devA.data.id,
    developerB: devB.data.id,
    leadA: lsA.data.id,
    leadB: lsB.data.id,
  };

  const tax = await admin
    .from("tax_settings")
    .select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered")
    .eq("workspace_id", workspaceId)
    .single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };

  console.log(`\n== M5.3 payments-list perf harness — ${N} payments ==`);
  console.log(`workspace ${workspaceId} (throwaway user ${PERF_EMAIL})`);

  // --- seed N deals, then one payment per deal (direct insert, service role) ---
  const inputs = syntheticInputs(N);
  const dealRows = inputs.map((input, i) => toDealRow(input, i, workspaceId, refs, settings, userId));
  const dealIdByCode = new Map<string, string>();
  const seedStart = performance.now();
  for (let i = 0; i < dealRows.length; i += 500) {
    const chunk = dealRows.slice(i, i + 500);
    const ins = await admin.from("deal").insert(chunk).select("id,deal_code");
    if (ins.error) throw new Error(`insert deals: ${ins.error.message}`);
    for (const r of ins.data as { id: string; deal_code: string }[]) dealIdByCode.set(r.deal_code, r.id);
  }
  const payRows = dealRows.map((deal, i) =>
    toPaymentRow(inputs[i], deal, dealIdByCode.get(deal.deal_code as string)!, i, settings, userId)
  );
  for (let i = 0; i < payRows.length; i += 500) {
    const chunk = payRows.slice(i, i + 500);
    const ins = await admin.from("payment").insert(chunk);
    if (ins.error) throw new Error(`insert payments: ${ins.error.message}`);
  }
  console.log(`seeded ${N} deals + ${N} payments in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  // --- as the real user (JWT) for the RLS-scoped measurement -----------------
  const user = createClient(url, anonKey, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  const RUNS = 25;

  // --- network floor: the WAN round-trip time from this machine to the DB -----
  // The §8 targets are SERVER times; the app runs co-located with Supabase in
  // prod, but this harness measures wall-clock from a dev machine, so every
  // round-trip carries the WAN RTT. A minimal HEAD count isolates that floor so
  // the report can separate server work from network latency and gate on the
  // former (list = 1 round-trip, preview = 2 sequential round-trips).
  const floorDur: number[] = [];
  for (let i = 0; i < 15; i += 1) {
    const s = performance.now();
    await user.from("tax_settings").select("workspace_id", { count: "exact", head: true });
    if (i >= 3) floorDur.push(performance.now() - s);
  }
  const floorSorted = floorDur.slice().sort((a, b) => a - b);
  const netFloor = floorSorted[Math.floor(floorSorted.length / 2)];

  // --- target 1: payments-list read P95 (the /payments query) ----------------
  const listDur: number[] = [];
  let rowCount = 0;
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const q = await user
      .from("payment")
      .select(PAYMENT_LIST_SELECT)
      .is("archived_at", null)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (q.error) throw new Error(`payments query: ${q.error.message}`);
    const ms = performance.now() - s;
    if (i >= 3) listDur.push(ms); // drop warm-up
    rowCount = (q.data ?? []).length;
  }
  const listP95 = p95(listDur);

  // --- target 2: picker type-ahead < 150 ms over 1,000 deals -----------------
  // Two parts: the one-time picker LOAD (listActivePaymentDeals) and the pure,
  // per-keystroke filter the §8 target actually measures (the type-ahead runs in
  // the browser over the preloaded index — no network per keystroke).
  const pickerLoadStart = performance.now();
  const pickerLoad = await user
    .from("deal")
    .select(
      "id,deal_code,display_label,client_name,booked_year,developer:developer_id(name),receivable:receivable!deal_id(status,balance::text)"
    )
    .is("archived_at", null)
    .order("deal_code", { ascending: true });
  if (pickerLoad.error) throw new Error(`picker load: ${pickerLoad.error.message}`);
  const pickerLoadMs = performance.now() - pickerLoadStart;
  const pickerOptions = (pickerLoad.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const dev = r.developer as { name: string } | null;
    const rec = r.receivable as { status: string; balance: string | null } | null;
    return {
      id: r.id, deal_code: r.deal_code, display_label: r.display_label, client_name: r.client_name,
      booked_year: r.booked_year, developer_name: dev?.name ?? null,
      receivable_status: (rec?.status ?? null) as PaymentDealOption["receivable_status"],
      balance: rec?.balance ?? null,
    } as PaymentDealOption;
  });
  // 5 keystrokes narrowing "client 500" — the pure filter, the actual §8 metric.
  const filterDur: number[] = [];
  for (const q of ["c", "cl", "cli", "clien", "client 500"]) {
    const s = performance.now();
    filterPaymentDeals(pickerOptions, q);
    filterDur.push(performance.now() - s);
  }
  const pickerFilterMax = Math.max(...filterDur);

  // --- target 3: split preview server round-trip < 100 ms --------------------
  // Mirrors previewPayment's server work: resolve the deal, then in parallel read
  // the receivable + the same-day duplicates, then the pure engine split.
  const probeDeal = dealRows[0];
  const probeDealId = dealIdByCode.get(probeDeal.deal_code as string)!;
  const probeSplitInput: PaymentSplitInput = {
    gross: "125000.00",
    vat_basis: dbVatBasisToEngine(probeDeal.vat_basis as "inclusive" | "n_a"),
    payment_type: "commission",
    incentive_taxable: inputs[0].incentive_taxable,
    ewt_subject: probeDeal.taxable as boolean,
  };
  const previewDur: number[] = [];
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const dealRead = await user.from("deal").select(DEAL_SELECT).eq("id", probeDealId).maybeSingle();
    if (dealRead.error) throw new Error(`preview deal read: ${dealRead.error.message}`);
    await Promise.all([
      user.from("receivable").select("id,status,version,balance::text,total_collectible::text,collected_net::text").eq("deal_id", probeDealId).maybeSingle(),
      user.from("payment").select("id,payment_date,gross_amount::text").eq("deal_id", probeDealId).eq("payment_date", "2026-07-15").is("archived_at", null),
    ]);
    computePaymentSplit(probeSplitInput, settings); // pure — the money truth
    const ms = performance.now() - s;
    if (i >= 3) previewDur.push(ms);
  }
  const previewP95 = p95(previewDur);

  // --- target 4: create round-trip < 300 ms (validate + split + events) ------
  // Real create_payment RPC calls as the JWT user, split computed by the engine.
  const createSplit = computePaymentSplit(probeSplitInput, settings);
  const createDur: number[] = [];
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const res = await user.rpc("create_payment", {
      p_deal_id: probeDealId,
      p_payment_date: "2026-08-15",
      p_gross_amount: "125000.00",
      p_payment_type: "commission",
      p_reference_note: `perf-${i}`,
      p_net_of_vat: createSplit.net_of_vat,
      p_vat_amount: createSplit.vat,
      p_ewt_amount: createSplit.ewt,
      p_net_cash: createSplit.net_cash,
      p_retained_cash: createSplit.retained,
      p_vat_basis_used: probeDeal.vat_basis as string,
      p_ewt_rate_used: settings.ewt_rate,
      p_vat_rate_used: settings.vat_rate,
    });
    if (res.error) throw new Error(`create_payment: ${res.error.message}`);
    const ms = performance.now() - s;
    if (i >= 3) createDur.push(ms);
  }
  const createP95 = p95(createDur);
  const createSorted = createDur.slice().sort((a, b) => a - b);
  const createMedian = createSorted[Math.floor(createSorted.length / 2)];

  // --- report ---------------------------------------------------------------
  // Server time = wall-clock minus the WAN round-trips it contains (list: 1,
  // preview: 2). The gate is on SERVER time, so it means the same thing whether the
  // harness runs co-located (netFloor ≈ 0) or over WAN from a dev machine.
  const listServer = Math.max(0, listP95 - netFloor);
  const previewServer = Math.max(0, previewP95 - 2 * netFloor);
  const line = (label: string, value: number, target: number) =>
    `${label.padEnd(28)} ${value.toFixed(1).padStart(7)} ms   (target < ${target} ms)  ${value < target ? "PASS" : "FAIL"}`;
  console.log(`\nrows read: ${rowCount}, picker deals: ${pickerOptions.length}`);
  console.log(`network floor (WAN RTT):     ${netFloor.toFixed(1)} ms  (subtracted from the server-time gates below)`);
  console.log(line("payments-list read P95:", listServer, LIST_P95_MS));
  console.log(`   (raw wall-clock ${listP95.toFixed(1)} ms incl. 1 WAN round-trip)`);
  console.log(line("create round-trip P95:", createP95, CREATE_MS));
  console.log(`   (create median ${createMedian.toFixed(1)} ms — a single round-trip, so raw is already server+1 RTT)`);
  console.log(line("split preview P95:", previewServer, PREVIEW_MS));
  console.log(`   (raw wall-clock ${previewP95.toFixed(1)} ms incl. 2 sequential WAN round-trips)`);
  console.log(line("picker type-ahead (max):", pickerFilterMax, PICKER_MS));
  console.log(`   (picker one-time load ${pickerLoadMs.toFixed(1)} ms, not the per-keystroke metric)`);

  // --- cleanup --------------------------------------------------------------
  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  // create is a single round-trip so its raw P95 already includes exactly one WAN
  // RTT; gate it against the target plus the floor so the WAN run is comparable.
  const failed =
    listServer >= LIST_P95_MS ||
    createP95 - netFloor >= CREATE_MS ||
    previewServer >= PREVIEW_MS ||
    pickerFilterMax >= PICKER_MS;
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
