/**
 * M3.4 — the Rule P12 YTD-aggregate perf harness (M3 PRD §8: the pace aggregate over
 * ≥ 1,000 deals < 300 ms P95, with a covering index on
 * (workspace_id, booked_year, transaction_type, representation)).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-plan-ytd.ts [N]
 *   pnpm run perf:plan-ytd
 *
 * Seeds N deals (default 1,000) spread across 3 booked years into a THROWAWAY workspace,
 * then measures plan_ytd_actual_sales for the busiest year both ways the OQ-1 flag runs it
 * (include rentals = the workbook default, and exclude = sales only). Gated on the true
 * Postgres execution time (EXPLAIN ANALYZE, machine-independent) — dev-machine wall-clock
 * is WAN-bound and absent in prod. Also prints the query plan node so the
 * index-vs-seq-scan decision is auditable. CI-safe: prints "skipped" on placeholder creds.
 *
 * Throwaway user + service-role inserts + delete-after — delta-residue zero.
 */
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";

const N = Number(process.argv[2] ?? 1000);
const PERF_EMAIL = "perf-plan-ytd@solo.test";
const PERF_PASSWORD = "zeta-perf-password";
const TARGET_MS = 300; // M3 §8

function loadEnv(): Record<string, string> {
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

async function mgmt(url: string, token: string, sql: string): Promise<unknown> {
  const ref = new URL(url).host.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "node" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`SQL failed: HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/** EXPLAIN ANALYZE → { ms, node } (top plan node name — the index/seq-scan witness). */
async function explain(url: string, token: string, sql: string): Promise<{ ms: number; node: string }> {
  const body = (await mgmt(url, token, `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`)) as Array<{
    "QUERY PLAN": Array<{ "Execution Time": number; Plan: { "Node Type": string; "Index Name"?: string } }>;
  }>;
  const plan = body[0]["QUERY PLAN"][0];
  const p = plan.Plan;
  // Walk down to the first scan node for a readable witness.
  let scan: { "Node Type": string; "Index Name"?: string; Plans?: unknown[] } = p as never;
  while (scan.Plans && scan.Plans.length > 0 && !scan["Index Name"] && !/Scan/.test(scan["Node Type"])) {
    scan = scan.Plans[0] as never;
  }
  const node = scan["Index Name"] ? `${scan["Node Type"]} using ${scan["Index Name"]}` : scan["Node Type"];
  return { ms: plan["Execution Time"], node };
}

type Ref = { propertyTypeId: string; developerA: string; developerB: string; leadA: string; leadB: string };

/** Resale / Developer / Rental / Referral spread across 3 booked years (mirrors perf-yield). */
function syntheticInputs(count: number): DealComputeInput[] {
  const out: DealComputeInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = i % 5;
    const listPrice = (2_000_000 + (i % 60) * 125_000).toFixed(2);
    if (kind <= 1) {
      out.push({
        deal_type: "developer", transaction_type: "sale", representation: "seller",
        force_vat: i % 9 === 0, property_vat_rule: i % 2 === 0 ? "threshold" : "always_vat",
        list_price: listPrice, commission: { basis: "percent", rate: "0.05" },
        developer_comm_base: i % 2 === 0 ? "net" : "gross", receipt_issued: true,
        incentive_billed: (i % 3 === 0 ? 50_000 : 0).toFixed(2), incentive_taxable: i % 3 === 0 ? "yes" : null,
        referral_out_pct: "0", referral_out_fixed: (i % 4 === 0 ? 10_000 : 0).toFixed(2),
      });
    } else if (kind === 2) {
      out.push({
        deal_type: "resale", transaction_type: "sale", representation: "buyer",
        force_vat: false, property_vat_rule: "always_exempt", list_price: listPrice,
        commission: { basis: "fixed", amount: "200000.00" }, developer_comm_base: null,
        receipt_issued: true, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0.02", referral_out_fixed: "0.00",
      });
    } else if (kind === 3) {
      // A Referrer deal — Rule P12 excludes it (no sales volume of the agent's own).
      out.push({
        deal_type: "resale", transaction_type: "sale", representation: "referrer",
        force_vat: false, property_vat_rule: "threshold", list_price: listPrice,
        commission: { basis: "percent", rate: "0.03" }, developer_comm_base: null,
        receipt_issued: false, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0", referral_out_fixed: "0.00",
      });
    } else {
      // A rental — included by the workbook default, excluded when the OQ-1 flag is off.
      out.push({
        deal_type: "n/a", transaction_type: "rental", representation: "lessor",
        force_vat: false, property_vat_rule: "always_exempt",
        list_price: (240_000 + (i % 20) * 12_000).toFixed(2),
        commission: { basis: "percent", rate: "1/12" }, developer_comm_base: null,
        receipt_issued: true, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0", referral_out_fixed: "0.00",
      });
    }
  }
  return out;
}

function toDealRow(input: DealComputeInput, index: number, workspaceId: string, refs: Ref, settings: EngineSettings, actor: string) {
  const derived = dealDerivedDbFields(computeDeal(input, settings));
  const isDeveloper = input.deal_type === "developer";
  const code = `D${String(index + 1).padStart(6, "0")}`;
  return {
    workspace_id: workspaceId, deal_code: code, booked_date: `${2024 + (index % 3)}-06-01`,
    transaction_type: input.transaction_type, deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? (index % 2 === 0 ? refs.developerA : refs.developerB) : null,
    client_name: `Perf Client ${index + 1}`, representation: input.representation,
    property_type_id: refs.propertyTypeId, lead_source_id: index % 2 === 0 ? refs.leadA : refs.leadB,
    property_details: `Synthetic unit ${index + 1}`, mode_of_payment: "cash", list_price: input.list_price,
    force_vat: input.force_vat, commission_basis: input.commission.basis,
    rate_pct: input.commission.basis === "percent" ? input.commission.rate : null,
    fixed_amount: input.commission.basis === "fixed" ? input.commission.amount : null,
    receipt_issued: input.receipt_issued, incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable, referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed, referral_paid: index % 8 !== 0,
    ...derived, booked_year: 2024 + (index % 3), display_label: `${code} — Perf Client ${index + 1}`,
    version: 1, created_by: actor, updated_by: actor,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;

  if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS" || !serviceKey || !anonKey) {
    console.log("perf:plan-ytd — skipped (no live Supabase credentials in .env.local).");
    return;
  }

  const admin = createClient(url, serviceKey, { db: { schema: "commission" }, auth: { autoRefreshToken: false, persistSession: false } });

  const existing = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === PERF_EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const created = await admin.auth.admin.createUser({ email: PERF_EMAIL, password: PERF_PASSWORD, email_confirm: true, user_metadata: { display_name: "Perf" } });
  if (created.error) throw new Error(`create perf user: ${created.error.message}`);
  const userId = created.data.user.id;

  const membership = await admin.from("membership").select("workspace_id").eq("user_id", userId).maybeSingle<{ workspace_id: string }>();
  const workspaceId = membership.data?.workspace_id;
  if (!workspaceId) throw new Error("signup bootstrap did not create a workspace");

  const pt = await admin.from("property_type").insert({ workspace_id: workspaceId, name: "Perf Type", vat_rule: "threshold", created_by: userId }).select("id").single();
  const devA = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer A", comm_base: "net", created_by: userId }).select("id").single();
  const devB = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer B", comm_base: "gross", created_by: userId }).select("id").single();
  const lsA = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source A", sort_order: 1, created_by: userId }).select("id").single();
  const lsB = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source B", sort_order: 2, created_by: userId }).select("id").single();
  if (pt.error || devA.error || devB.error || lsA.error || lsB.error) throw new Error("seed refs failed");
  const refs: Ref = { propertyTypeId: pt.data.id, developerA: devA.data.id, developerB: devB.data.id, leadA: lsA.data.id, leadB: lsB.data.id };

  const tax = await admin.from("tax_settings").select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered").eq("workspace_id", workspaceId).single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };

  console.log(`\n== M3.4 plan-ytd perf harness — ${N} deals ==`);
  console.log(`workspace ${workspaceId} (throwaway user ${PERF_EMAIL})`);

  const inputs = syntheticInputs(N);
  const dealRows = inputs.map((input, i) => toDealRow(input, i, workspaceId, refs, settings, userId));
  const seedStart = performance.now();
  for (let i = 0; i < dealRows.length; i += 500) {
    const ins = await admin.from("deal").insert(dealRows.slice(i, i + 500));
    if (ins.error) throw new Error(`insert deals: ${ins.error.message}`);
  }
  console.log(`seeded ${N} deals across 2024–2026 in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  const user = createClient(url, anonKey, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  // The busiest booked year (2024 gets index%3==0, the most rows for N not divisible by 3).
  const YEAR = 2024;
  const inc = `SELECT coalesce(sum(d.list_price),0)::text FROM commission.deal d WHERE d.workspace_id='${workspaceId}' AND d.archived_at IS NULL AND d.booked_year=${YEAR} AND d.representation <> 'referrer' AND (true OR d.transaction_type='sale')`;
  const exc = `SELECT coalesce(sum(d.list_price),0)::text FROM commission.deal d WHERE d.workspace_id='${workspaceId}' AND d.archived_at IS NULL AND d.booked_year=${YEAR} AND d.representation <> 'referrer' AND (false OR d.transaction_type='sale')`;

  const incExec = accessToken ? await explain(url, accessToken, inc) : { ms: 0, node: "n/a" };
  const excExec = accessToken ? await explain(url, accessToken, exc) : { ms: 0, node: "n/a" };
  const serverP95 = Math.max(incExec.ms, excExec.ms);

  // Raw wall-clock over the RPC the app calls (WAN-bound; the scalar payload is tiny).
  const RUNS = 20;
  const wall: number[] = [];
  let ytdInclude = "";
  let ytdExclude = "";
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const r = await user.rpc("plan_ytd_actual_sales", { p_year: YEAR, p_include_rentals: true });
    if (r.error) throw new Error(`rpc: ${r.error.message}`);
    if (i >= 3) wall.push(performance.now() - s);
    ytdInclude = r.data as string;
  }
  const rExc = await user.rpc("plan_ytd_actual_sales", { p_year: YEAR, p_include_rentals: false });
  ytdExclude = rExc.data as string;

  const line = (label: string, value: number) =>
    `${label.padEnd(38)} ${value.toFixed(2).padStart(8)} ms   (target < ${TARGET_MS} ms)  ${value < TARGET_MS ? "PASS" : "FAIL"}`;
  console.log(`\nYTD ${YEAR}: include=${ytdInclude} · exclude=${ytdExclude} (rentals delta = the flag's effect)`);
  console.log(`plan node (include): ${incExec.node}`);
  console.log(`server exec (EXPLAIN ANALYZE): include ${incExec.ms.toFixed(2)} ms · exclude ${excExec.ms.toFixed(2)} ms`);
  console.log(line("plan-ytd aggregate P95 (server):", serverP95));
  console.log(`   (raw dev-machine wall-clock P95 ${p95(wall).toFixed(1)} ms over the RPC is WAN-bound, absent in prod)`);

  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  if (serverP95 >= TARGET_MS) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
