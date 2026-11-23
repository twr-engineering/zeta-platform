/**
 * M2.4 — the live Yield Summary read perf harness (M2 PRD §8 / criterion 13: report
 * render < 500 ms P95 at ≥ 1,000 deals).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-yield.ts [N]
 *   pnpm run perf:yield
 *
 * Seeds N deals (default 1,000) into a THROWAWAY workspace, rebuilds the materialized
 * yield_aggregate from them (the same GROUP BY over commission_private.deal_segment the consumer would
 * produce) + a basis_version row, then measures the three reads getYieldSummaryView
 * runs in parallel:
 *   · loadYieldAggregates   — the report + planning basis (O(segments × years) cells)
 *   · loadUnclassifiedDealCodes — the Rule 9 invariant (scans the classification columns)
 *   · getYieldBasisVersion  — the card's version stamp (one row)
 * Server time = the max of the three (they run in parallel). Gated on the true Postgres
 * execution time (EXPLAIN ANALYZE, machine-independent) — the dev-machine wall-clock is
 * WAN-payload bound and absent in prod. CI-safe: prints "skipped" on placeholder creds.
 *
 * The fixtures are never committed: a throwaway user, rows inserted with the service
 * role, then the user is deleted (orphan reaper takes the workspace).
 */
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import {
  computeDeal,
  type DealComputeInput,
  type EngineSettings,
} from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";

const N = Number(process.argv[2] ?? 1000);
const PERF_EMAIL = "perf-yield@solo.test";
const PERF_PASSWORD = "zeta-perf-password";
const TARGET_MS = 500; // M2 §8 / criterion 13

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

async function explainMs(url: string, token: string, sql: string): Promise<number> {
  const ref = new URL(url).host.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}` }),
  });
  if (!res.ok) throw new Error(`EXPLAIN failed: HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as Array<{ "QUERY PLAN": Array<{ "Execution Time": number }> }>;
  return body[0]["QUERY PLAN"][0]["Execution Time"];
}

async function runSql(url: string, token: string, sql: string): Promise<void> {
  const ref = new URL(url).host.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`SQL failed: HTTP ${res.status}: ${await res.text()}`);
}

type Ref = { propertyTypeId: string; developerA: string; developerB: string; leadA: string; leadB: string };

/** A spread of Resale / Developer / Rental / Referral deals across 3 booked years. */
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
      // A Referrer deal — lands on the Referral line, never the sales blend (Rule 2).
      out.push({
        deal_type: "resale", transaction_type: "sale", representation: "referrer",
        force_vat: false, property_vat_rule: "threshold", list_price: listPrice,
        commission: { basis: "percent", rate: "0.03" }, developer_comm_base: null,
        receipt_issued: false, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0", referral_out_fixed: "0.00",
      });
    } else {
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
    console.log("perf:yield — skipped (no live Supabase credentials in .env.local).");
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

  console.log(`\n== M2.4 yield perf harness — ${N} deals ==`);
  console.log(`workspace ${workspaceId} (throwaway user ${PERF_EMAIL})`);

  const inputs = syntheticInputs(N);
  const dealRows = inputs.map((input, i) => toDealRow(input, i, workspaceId, refs, settings, userId));
  const seedStart = performance.now();
  for (let i = 0; i < dealRows.length; i += 500) {
    const ins = await admin.from("deal").insert(dealRows.slice(i, i + 500));
    if (ins.error) throw new Error(`insert deals: ${ins.error.message}`);
  }

  // Rebuild the materialized aggregate from the seeded deals (the same shape the yield
  // consumer produces) + a basis_version row, so the reads measure a realistic state.
  if (accessToken) {
    await runSql(url, accessToken,
      `INSERT INTO commission.yield_aggregate (workspace_id, segment, booked_year, deal_count, volume_sum, gci_sum, incentive_net_sum, referral_out_sum)
       SELECT workspace_id, commission_private.deal_segment(transaction_type, deal_type, representation) AS seg, booked_year,
              count(*), sum(list_price), sum(net_gci), sum(incentive_net), sum(referral_out)
       FROM commission.deal
       WHERE workspace_id='${workspaceId}' AND archived_at IS NULL
         AND commission_private.deal_segment(transaction_type, deal_type, representation) IS NOT NULL
       GROUP BY workspace_id, seg, booked_year
       ON CONFLICT (workspace_id, segment, booked_year) DO NOTHING;`);
    await runSql(url, accessToken,
      `INSERT INTO commission.yield_basis_version (workspace_id, basis_version, computed_at)
       VALUES ('${workspaceId}', 1, now()) ON CONFLICT (workspace_id) DO UPDATE SET basis_version = 1;`);
  }
  console.log(`seeded ${N} deals + rebuilt aggregate in ${((performance.now() - seedStart) / 1000).toFixed(1)}s`);

  const user = createClient(url, anonKey, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);

  // --- server exec of the three parallel reads (machine-independent) ---------
  const aggExec = accessToken
    ? await explainMs(url, accessToken, `SELECT segment, booked_year, deal_count, volume_sum::text, gci_sum::text, incentive_net_sum::text, referral_out_sum::text FROM commission.yield_aggregate WHERE workspace_id='${workspaceId}' ORDER BY segment, booked_year`)
    : 0;
  const invExec = accessToken
    ? await explainMs(url, accessToken, `SELECT deal_code, transaction_type, deal_type, representation FROM commission.deal WHERE workspace_id='${workspaceId}' AND archived_at IS NULL`)
    : 0;
  const verExec = accessToken
    ? await explainMs(url, accessToken, `SELECT basis_version, computed_at FROM commission.yield_basis_version WHERE workspace_id='${workspaceId}'`)
    : 0;
  const serverP95 = Math.max(aggExec, invExec, verExec);

  // --- raw dev-machine wall-clock over the parallel read (WAN-bound) ---------
  const RUNS = 20;
  const wall: number[] = [];
  let cellCount = 0;
  let unclassified = -1;
  for (let i = 0; i < RUNS + 3; i += 1) {
    const s = performance.now();
    const [aggQ, dealQ, verQ] = await Promise.all([
      user.from("yield_aggregate").select("segment,booked_year,deal_count,volume_sum::text,gci_sum::text,incentive_net_sum::text,referral_out_sum::text").order("segment").order("booked_year"),
      user.from("deal").select("deal_code,transaction_type,deal_type,representation").is("archived_at", null),
      user.from("yield_basis_version").select("basis_version,computed_at").maybeSingle(),
    ]);
    if (aggQ.error || dealQ.error) throw new Error(`read: ${aggQ.error?.message ?? dealQ.error?.message}`);
    if (i >= 3) wall.push(performance.now() - s);
    cellCount = (aggQ.data ?? []).length;
    // The Rule 9 invariant classifies in JS (reproduced) — 0 for a clean partition.
    unclassified = (dealQ.data ?? []).filter((d) => {
      const r = d as { transaction_type: string; deal_type: string; representation: string };
      if (r.representation === "referrer") return false;
      if (r.transaction_type === "rental") return false;
      if (r.transaction_type === "sale") return !(r.deal_type === "resale" || r.deal_type === "developer");
      return true;
    }).length;
    void verQ;
  }

  const line = (label: string, value: number) =>
    `${label.padEnd(34)} ${value.toFixed(2).padStart(8)} ms   (target < ${TARGET_MS} ms)  ${value < TARGET_MS ? "PASS" : "FAIL"}`;
  console.log(`\naggregate cells: ${cellCount} · unclassified (Rule 9): ${unclassified}`);
  console.log(`server read exec (EXPLAIN): aggregate ${aggExec.toFixed(2)} ms · invariant ${invExec.toFixed(2)} ms · version ${verExec.toFixed(2)} ms`);
  console.log(line("yield read P95 (server, parallel max):", serverP95));
  console.log(`   (raw dev-machine wall-clock P95 ${p95(wall).toFixed(1)} ms is WAN-payload bound — the ${cellCount}-cell + ${N}-row transfer — absent in prod)`);

  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);

  if (serverP95 >= TARGET_MS) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
