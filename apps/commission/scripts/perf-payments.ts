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
import { readFileSync } from "node:fs";
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
import { PAYMENT_SELECT } from "@/lib/supabase/selects";

const N = Number(process.argv[2] ?? 1000);
const PERF_EMAIL = "perf-payments@solo.test";
const PERF_PASSWORD = "zeta-perf-password";

// Target (M5 PRD §8).
const LIST_P95_MS = 500;

// The exact select the /payments read uses (queries.ts PAYMENT_LIST_SELECT).
const PAYMENT_LIST_SELECT = `${PAYMENT_SELECT},deal:deal_id(deal_code,booked_year,client_name,property_details,deal_type,vat_basis,developer:developer_id(id,name))`;

function loadEnv(): Record<string, string> {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
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
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  // --- target: payments-list read P95 (the /payments query) ------------------
  const RUNS = 25;
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

  // --- report ---------------------------------------------------------------
  console.log(`\nrows read: ${rowCount}`);
  console.log(
    `payments-list read P95:  ${listP95.toFixed(1)} ms   (target < ${LIST_P95_MS} ms)  ${listP95 < LIST_P95_MS ? "PASS" : "FAIL"}`
  );

  // --- cleanup --------------------------------------------------------------
  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  if (listP95 >= LIST_P95_MS) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
