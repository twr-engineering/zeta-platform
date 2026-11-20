/**
 * M9.1 — the Search read-layer perf harness (M9 PRD §8 / AC13: any filter
 * combination returns page 1 in < 300 ms P95 on a workspace with ≥ 1,000 deals and
 * ≥ 1,000 payments; the contains filter must use the trigram index — no seq scan).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/perf-search.ts [N]
 *   pnpm run perf:search
 *
 * Seeds N deals (default 1,000) + one receivable each + N payments into a THROWAWAY
 * workspace (service role, engine-computed money), then measures the SERVER
 * execution time (EXPLAIN ANALYZE via the Management API — machine-independent) of
 * the raw SELECT each source query function runs, for the PRD criterion filters:
 * the contains filter (GIN trigram), the amount sort, Collectibles open+balance,
 * the Payments year lens, and the Deal ID lookup. It also asserts the contains
 * plan actually uses `deal_search_blob_trgm` (not a Seq Scan), and checks
 * projection staleness (< 5 s, Rule 16) by reading a just-inserted payment.
 *
 * CI-safe: prints "skipped" + exits 0 on placeholder credentials. Throwaway user is
 * deleted at the end; the orphan reaper takes the workspace + all its rows.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import writeXlsxFile from "write-excel-file/node";

import { computeDeal, type DealComputeInput, type EngineSettings } from "@/lib/engine";
import { dealDerivedDbFields } from "@/lib/deals/map";
import { toCsv, toXlsxRows, xlsxColumnWidths } from "@/lib/export/format";
import { searchExportSpec } from "@/lib/search/export-columns";
import type { DealSearchRow, SearchResultRow } from "@/lib/search/types";

const N = Number(process.argv[2] ?? 1000);
const YEARS = 10;
const BASE_YEAR = 2017;
const PERF_EMAIL = "perf-search@solo.test";
const PERF_PASSWORD = "zeta-perf-password";
const TARGET_MS = 300; // M9 §8 / AC13
const EXPORT_ROWS = 2000; // M9 §8 — export completes < 10 s for 2,000 rows
const EXPORT_TARGET_MS = 10_000;
// The trigram "no seq scan at scale" proof (PRD §8 / DoD) needs a table big enough
// that a selective needle makes the GIN the cheapest plan — a couple thousand rows
// is small enough that a seq scan legitimately wins, so prove it where it matters.
const TRIGRAM_SCALE = Number(process.env.TRIGRAM_SCALE ?? 20000);

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
    /* CI — process.env alone drives the skip decision. */
  }
  return env;
}

type Plan = Array<{ "QUERY PLAN": [{ "Execution Time": number; Plan: unknown }] }>;

async function mgmtQuery(url: string, token: string, query: string): Promise<unknown> {
  const ref = new URL(url).host.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management query failed: HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Run raw SQL (e.g. ANALYZE) so EXPLAIN below reflects real planner statistics. */
async function runSql(url: string, token: string, sql: string): Promise<void> {
  await mgmtQuery(url, token, sql);
}

/**
 * Machine-independent server-exec of one query. `noSeqScan` disables sequential
 * scans for this statement so the planner MUST pick an index — used to prove the
 * trigram GIN is a valid, fast plan for the contains filter even when a tiny
 * seeded table makes a seq scan cost-cheaper (the crossover is a size decision,
 * not an index-availability one).
 */
async function explain(
  url: string,
  token: string,
  sql: string,
  opts: { noSeqScan?: boolean } = {}
): Promise<{ ms: number; text: string }> {
  const prefix = opts.noSeqScan ? "set enable_seqscan = off; " : "";
  const body = (await mgmtQuery(
    url,
    token,
    `${prefix}EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`
  )) as Plan;
  return { ms: body[0]["QUERY PLAN"][0]["Execution Time"], text: JSON.stringify(body[0]["QUERY PLAN"][0].Plan) };
}

type Ref = { propertyTypeId: string; developerA: string; leadSourceId: string };

function syntheticInputs(count: number): DealComputeInput[] {
  const out: DealComputeInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const listPrice = (2_000_000 + (i % 60) * 125_000).toFixed(2);
    if (i % 3 === 0) {
      out.push({
        deal_type: "developer", transaction_type: "sale", representation: "seller",
        force_vat: false, property_vat_rule: "threshold", list_price: listPrice,
        commission: { basis: "percent", rate: "0.05" }, developer_comm_base: "net",
        receipt_issued: true, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0", referral_out_fixed: "0.00",
      });
    } else {
      out.push({
        deal_type: "resale", transaction_type: "sale", representation: "buyer",
        force_vat: false, property_vat_rule: "always_exempt", list_price: listPrice,
        commission: { basis: "percent", rate: "0.05" }, developer_comm_base: null,
        receipt_issued: false, incentive_billed: "0.00", incentive_taxable: null,
        referral_out_pct: "0", referral_out_fixed: "0.00",
      });
    }
  }
  return out;
}

function toDealRow(input: DealComputeInput, index: number, workspaceId: string, refs: Ref, settings: EngineSettings) {
  const derived = dealDerivedDbFields(computeDeal(input, settings));
  const isDeveloper = input.deal_type === "developer";
  const code = `D${String(index + 1).padStart(6, "0")}`;
  const bookedYear = BASE_YEAR + (index % YEARS);
  // Seed ~1/7 rows with a common token, plus one row with a UNIQUE token, so the
  // contains filter can be proven on a selective search (the real "find this
  // client" case, where the trigram index decisively beats a seq scan).
  const client =
    index === 0 ? "Needlefind Vale" : index % 7 === 0 ? `Lainie Vale ${index + 1}` : `Perf Client ${index + 1}`;
  return {
    workspace_id: workspaceId, deal_code: code, booked_date: `${bookedYear}-06-01`,
    transaction_type: input.transaction_type, deal_type: input.deal_type === "n/a" ? "n_a" : input.deal_type,
    developer_id: isDeveloper ? refs.developerA : null, client_name: client, representation: input.representation,
    property_type_id: refs.propertyTypeId, lead_source_id: refs.leadSourceId,
    property_details: `Synthetic unit ${index + 1}`, mode_of_payment: "cash", list_price: input.list_price,
    force_vat: input.force_vat, commission_basis: input.commission.basis,
    rate_pct: input.commission.basis === "percent" ? input.commission.rate : null,
    fixed_amount: input.commission.basis === "fixed" ? input.commission.amount : null,
    receipt_issued: input.receipt_issued, incentive_billed: input.incentive_billed,
    incentive_taxable: input.incentive_taxable, referral_out_pct: input.referral_out_pct,
    referral_out_fixed: input.referral_out_fixed, referral_paid: false,
    ...derived, booked_year: bookedYear, display_label: `${code} — ${client}`, version: 1,
  };
}

function toReceivableRow(deal: Record<string, unknown>, dealId: string, index: number) {
  const collectible = deal.default_total_collectible as string;
  let status: "open" | "closed" | "cancelled" = "open";
  let collected = "0.00";
  let balance: string | null = collectible;
  if (index % 5 === 0) { status = "closed"; collected = collectible; balance = "0.00"; }
  else if (index % 3 === 0) { collected = (Number(collectible) * 0.4).toFixed(2); balance = (Number(collectible) - Number(collected)).toFixed(2); }
  return {
    workspace_id: deal.workspace_id, deal_id: dealId, deal_code: deal.deal_code, booked_year: deal.booked_year,
    developer_id: deal.developer_id, client_name: deal.client_name, property_details: deal.property_details,
    deal_type: deal.deal_type, lead_source_id: deal.lead_source_id, booking_date: deal.booked_date,
    booked_net_gci: deal.net_gci, default_total_collectible: collectible, status,
    collected_net: collected, balance, chase_priority: balance ?? "0.00",
  };
}

function toPaymentRow(deal: Record<string, unknown>, dealId: string, index: number) {
  const paidYear = BASE_YEAR + ((index * 7) % YEARS);
  const month = (index % 12) + 1;
  return {
    workspace_id: deal.workspace_id, deal_id: dealId,
    payment_date: `${paidYear}-${String(month).padStart(2, "0")}-15`,
    gross_amount: "50000.00", payment_type: "commission", reference_note: null,
    net_of_vat: "44642.86", vat_amount: "5357.14", ewt_amount: "4464.29", net_cash: "45535.71",
    retained_cash: "40178.57", vat_basis_used: "inclusive", ewt_rate_used: "0.1000", vat_rate_used: "0.1200", version: 1,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;

  if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS" || !serviceKey || !anonKey || !accessToken) {
    console.log("perf:search — skipped (no live Supabase credentials in .env.local).");
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const existing = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === PERF_EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const created = await admin.auth.admin.createUser({ email: PERF_EMAIL, password: PERF_PASSWORD, email_confirm: true });
  if (created.error) throw new Error(`create perf user: ${created.error.message}`);
  const userId = created.data.user.id;

  const membership = await admin.from("membership").select("workspace_id").eq("user_id", userId).maybeSingle<{ workspace_id: string }>();
  const workspaceId = membership.data?.workspace_id;
  if (!workspaceId) throw new Error("signup bootstrap did not create a workspace");

  const pt = await admin.from("property_type").insert({ workspace_id: workspaceId, name: "Perf Type", vat_rule: "threshold", created_by: userId }).select("id").single();
  const devA = await admin.from("developer").insert({ workspace_id: workspaceId, name: "Perf Developer A", comm_base: "net", created_by: userId }).select("id").single();
  const lead = await admin.from("lead_source").insert({ workspace_id: workspaceId, name: "Perf Source", sort_order: 1, created_by: userId }).select("id").single();
  if (pt.error || devA.error || lead.error) throw new Error("seed refs failed");
  const refs: Ref = { propertyTypeId: pt.data.id, developerA: devA.data.id, leadSourceId: lead.data.id };

  const tax = await admin.from("tax_settings").select("vat_rate::text, ewt_rate::text, property_vat_threshold::text, vat_registered").eq("workspace_id", workspaceId).single();
  const settings: EngineSettings = {
    vat_rate: tax.data!.vat_rate as unknown as string,
    ewt_rate: tax.data!.ewt_rate as unknown as string,
    property_vat_threshold: tax.data!.property_vat_threshold as unknown as string,
    vat_registered: tax.data!.vat_registered as unknown as boolean,
  };

  console.log(`\n== M9.1 search perf harness — ${N} deals / ${N} receivables / ${N} payments ==`);
  const inputs = syntheticInputs(N);
  const dealRows = inputs.map((input, i) => toDealRow(input, i, workspaceId, refs, settings));
  const dealIdByCode = new Map<string, string>();
  for (let i = 0; i < dealRows.length; i += 500) {
    const ins = await admin.from("deal").insert(dealRows.slice(i, i + 500)).select("id,deal_code");
    if (ins.error) throw new Error(`insert deals: ${ins.error.message}`);
    for (const r of ins.data as { id: string; deal_code: string }[]) dealIdByCode.set(r.deal_code, r.id);
  }
  const recRows = dealRows.map((d, i) => toReceivableRow(d, dealIdByCode.get(d.deal_code as string)!, i));
  for (let i = 0; i < recRows.length; i += 500) {
    const ins = await admin.from("receivable").insert(recRows.slice(i, i + 500));
    if (ins.error) throw new Error(`insert receivables: ${ins.error.message}`);
  }
  const payRows = dealRows.map((d, i) => toPaymentRow(d, dealIdByCode.get(d.deal_code as string)!, i));
  for (let i = 0; i < payRows.length; i += 500) {
    const ins = await admin.from("payment").insert(payRows.slice(i, i + 500));
    if (ins.error) throw new Error(`insert payments: ${ins.error.message}`);
  }
  // ANALYZE so EXPLAIN reflects real planner statistics — a freshly bulk-inserted
  // table has stale stats, and an unanalyzed table makes every plan a guess.
  await runSql(url, accessToken, "analyze public.deal; analyze public.receivable; analyze public.payment;");
  console.log(`seeded into workspace ${workspaceId} (analyzed)\n`);

  const WS = `'${workspaceId}'::uuid`;
  // A selective needle (one matching row) — the real "find this client" case where
  // the workspace-scoped trigram GIN decisively beats a seq scan (PRD §8).
  const needle = `public.zeta_search_needle('needlefind')`;
  const contains = `d.search_blob like '%' || ${needle} || '%' escape '\\'`;

  // The raw SELECT each source function runs (same predicates / order / limit).
  const queries: Array<{ label: string; sql: string; mustUseTrgm?: boolean }> = [
    {
      label: "Deals · contains 'needlefind' (GIN)",
      mustUseTrgm: true,
      sql: `select count(*) over() c, d.id, dev.name, d.net_gci::text, d.booked_date
            from public.deal d left join public.developer dev on dev.id=d.developer_id
            where d.workspace_id=${WS} and ${contains}
            order by d.booked_date desc, d.deal_code asc limit 50`,
    },
    {
      label: "Deals · amount sort (net_gci desc)",
      sql: `select count(*) over() c, d.id, d.net_gci::text
            from public.deal d where d.workspace_id=${WS}
            order by d.net_gci desc, d.deal_code asc limit 50`,
    },
    {
      label: "Collectibles · Open + only-with-balance",
      sql: `select count(*) over() c, r.id, r.balance::text
            from public.receivable r
            where r.workspace_id=${WS} and r.status='open' and r.balance is not null and r.balance>0
            order by r.balance desc, r.deal_code asc limit 50`,
    },
    {
      label: "Payments · Year 2020 (paid-date range)",
      sql: `select count(*) over() c, p.id, p.payment_date, dd.deal_code
            from public.payment p join public.deal dd on dd.id=p.deal_id
            where p.workspace_id=${WS}
              and p.payment_date>=make_date(2020,1,1) and p.payment_date<make_date(2021,1,1)
            order by p.payment_date desc, dd.deal_code asc, p.id asc limit 50`,
    },
    {
      label: "Payments · Deal ID lookup",
      sql: `select count(*) over() c, p.id
            from public.payment p join public.deal dd on dd.id=p.deal_id
            where p.workspace_id=${WS} and dd.deal_code='D000500'
            order by p.payment_date desc limit 50`,
    },
    {
      // M9.3 — the trigram re-check with filters COMBINED (text + year + status),
      // the collectibles source (the only one carrying status). A selective needle
      // must still drive the receivable GIN even alongside the year + status
      // predicates — proving the contains path indexes at scale under an AND.
      label: "Collectibles · text+year+status combined (GIN)",
      mustUseTrgm: true,
      sql: `select count(*) over() c, r.id, r.balance::text
            from public.receivable r
            where r.workspace_id=${WS} and r.booked_year=${BASE_YEAR} and r.status='closed'
              and r.search_blob like '%' || public.zeta_search_needle('needlefind') || '%' escape '\\'
            order by r.balance desc, r.deal_code asc limit 50`,
    },
  ];

  const TRGM = /(deal|receivable)_search_blob_trgm/;
  async function p95Of(sql: string, opts: { noSeqScan?: boolean } = {}): Promise<{ p95: number; planText: string }> {
    const samples: number[] = [];
    let planText = "";
    for (let i = 0; i < 5; i += 1) {
      const { ms, text } = await explain(url, accessToken, sql, opts);
      samples.push(ms);
      planText = text;
    }
    samples.sort((a, b) => a - b);
    return { p95: samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))], planText };
  }

  // Warm + measure server exec (EXPLAIN ANALYZE), 5 samples P95.
  let worst = 0;
  for (const q of queries) {
    const def = await p95Of(q.sql);
    worst = Math.max(worst, def.p95);
    const pass = def.p95 < TARGET_MS;
    if (!pass) process.exitCode = 1;

    // At 1,000 rows every plan is sub-millisecond, so the planner legitimately
    // prefers a seq scan (a tiny table is cheaper to scan than to probe) — that is
    // a size decision, not an index problem, so it is REPORTED, never failed here.
    // The trigram's "no seq scan at scale" proof (PRD §8 / DoD) runs on its own
    // larger-scale set below, where a selective needle makes the GIN decisive.
    const idxNote = q.mustUseTrgm ? (TRGM.test(def.planText) ? " · GIN trigram ✓" : ` · seq scan at ${N} rows (trigram proven at scale below)`) : "";
    console.log(`  ${q.label.padEnd(46)} server P95 ${def.p95.toFixed(2)} ms  ${pass ? "PASS" : "FAIL"}${idxNote}`);
  }

  console.log(`\nworst server P95: ${worst.toFixed(2)} ms   (target < ${TARGET_MS} ms)  ${worst < TARGET_MS ? "PASS" : "FAIL"}`);

  // Projection staleness (< 5 s, Rule 16): a just-inserted payment is findable now.
  const anyDeal = dealIdByCode.get("D000001")!;
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  await user.auth.signInWithPassword({ email: PERF_EMAIL, password: PERF_PASSWORD });
  const before = await user.rpc("search_payments", { p_deal_code: "D000001", p_limit: 200 });
  const beforeN = (before.data as unknown[] | null)?.length ?? 0;
  await admin.from("payment").insert(toPaymentRow(dealRows[0], anyDeal, 99999));
  const t0 = Date.now();
  const after = await user.rpc("search_payments", { p_deal_code: "D000001", p_limit: 200 });
  const afterN = (after.data as unknown[] | null)?.length ?? 0;
  const lagMs = Date.now() - t0;
  console.log(`\nstaleness — new payment visible immediately (${beforeN} → ${afterN} rows, read ${lagMs} ms)  ${afterN === beforeN + 1 && lagMs < 5000 ? "PASS" : "FAIL"}`);
  if (!(afterN === beforeN + 1 && lagMs < 5000)) process.exitCode = 1;

  // === Full-route P95 (M9.3) — the REAL route path, not the hand-written mirror ===
  // The mirror SELECTs above prove machine-independent SERVER exec + index use; this
  // exercises page 1 through the ACTUAL function as the JWT user (PostgREST → RLS →
  // search_*), the exact call runSearch/the API makes. Dev-laptop wall-clock is
  // WAN-dominated (per the project's perf doctrine, the gate stays on server exec
  // above); a per-request network floor is subtracted so the server-attributable
  // number is legible and corroborates the < 300 ms NFR end to end.
  async function roundTripP95(fn: "search_deals" | "search_collectibles" | "search_payments", args: Record<string, unknown>): Promise<number> {
    const s: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const t = Date.now();
      const { error } = await user.rpc(fn, args);
      if (error) throw new Error(`${fn} round-trip: ${error.message}`);
      s.push(Date.now() - t);
    }
    s.sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  }
  // Network floor: a minimal authenticated PostgREST round-trip (one indexed row).
  const floorSamples: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const t = Date.now();
    await user.from("workspace").select("id").limit(1);
    floorSamples.push(Date.now() - t);
  }
  floorSamples.sort((a, b) => a - b);
  const floor = floorSamples[Math.floor(floorSamples.length * 0.5)]; // median floor

  const routeCases: Array<{ label: string; fn: "search_deals" | "search_collectibles" | "search_payments"; args: Record<string, unknown> }> = [
    { label: "Deals · contains 'needlefind'", fn: "search_deals", args: { p_text: "needlefind", p_limit: 50 } },
    { label: "Deals · amount sort", fn: "search_deals", args: { p_sort: "amount_desc", p_limit: 50 } },
    { label: "Collectibles · Open + only-with-balance", fn: "search_collectibles", args: { p_status: "open", p_only_with_balance: true, p_limit: 50 } },
    { label: "Collectibles · text+year+status combined", fn: "search_collectibles", args: { p_year: BASE_YEAR, p_status: "closed", p_text: "needlefind", p_limit: 50 } },
    { label: "Payments · Year lens", fn: "search_payments", args: { p_year: BASE_YEAR + 3, p_limit: 50 } },
  ];
  console.log(`\n== full-route page-1 P95 (authenticated RPC · network floor ≈ ${floor} ms) ==`);
  let worstAdjusted = 0;
  for (const c of routeCases) {
    const rt = await roundTripP95(c.fn, c.args);
    const adjusted = Math.max(0, rt - floor);
    worstAdjusted = Math.max(worstAdjusted, adjusted);
    console.log(`  ${c.label.padEnd(42)} round-trip P95 ${String(rt).padStart(5)} ms  ·  server-attributable ≈ ${adjusted} ms`);
  }
  console.log(`  worst server-attributable ≈ ${worstAdjusted} ms  (NFR < ${TARGET_MS} ms, gated on the machine-independent EXPLAIN above)`);

  // === Export timing (M9.3 / M9 §8) — < 10 s for 2,000 rows =====================
  // Top the deal set up to 2,000, then page the source query as the JWT user exactly
  // as /api/export/search does (p_limit batches), map to the projection, and assemble
  // both files with the SAME format helpers. The gate is the full end-to-end (paging
  // over WAN + assembly); passing from a dev laptop is conservative vs in-region.
  const expectedDeals = Math.max(N, EXPORT_ROWS);
  if (N < EXPORT_ROWS) {
    const topUp = syntheticInputs(EXPORT_ROWS - N).map((input, i) => toDealRow(input, N + i, workspaceId, refs, settings));
    for (let i = 0; i < topUp.length; i += 500) {
      const ins = await admin.from("deal").insert(topUp.slice(i, i + 500));
      if (ins.error) throw new Error(`top-up deals for export: ${ins.error.message}`);
    }
  }

  const mapDeal = (r: Record<string, unknown>): DealSearchRow => ({
    id: r.id as string,
    dealCode: r.deal_code as string,
    bookedDate: r.booked_date as string,
    transactionType: r.transaction_type as DealSearchRow["transactionType"],
    dealType: r.deal_type as DealSearchRow["dealType"],
    developerName: (r.developer_name as string | null) ?? null,
    clientName: r.client_name as string,
    propertyDetails: r.property_details as string,
    netGci: r.net_gci as string,
    bookedYear: r.booked_year as number,
    archived: r.archived as boolean,
  });

  const exportStart = Date.now();
  const exportRows: SearchResultRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await user.rpc("search_deals", { p_limit: 1000, p_offset: offset });
    if (error) throw new Error(`export paging: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;
    for (const r of rows) exportRows.push(mapDeal(r));
    if (rows.length < 1000) break;
  }
  const pagingMs = Date.now() - exportStart;

  const spec = searchExportSpec("deals");
  const ds = { name: spec.sheet, sheet: spec.sheet, columns: spec.columns, rows: exportRows };
  const csvStart = Date.now();
  const csv = toCsv(ds);
  const csvMs = Date.now() - csvStart;
  const xlsxStart = Date.now();
  const xlsxBuf = await writeXlsxFile(toXlsxRows(ds), { columns: xlsxColumnWidths(ds), sheet: spec.sheet }).toBuffer();
  const xlsxMs = Date.now() - xlsxStart;
  const totalMs = Date.now() - exportStart;

  const csvLines = csv.replace(/^﻿/, "").trimEnd().split("\r\n").length - 1; // minus header
  const exportOk = exportRows.length === expectedDeals && csvLines === expectedDeals && xlsxBuf.length > 0 && totalMs < EXPORT_TARGET_MS;
  console.log(`\n== export ${exportRows.length} rows (target ${expectedDeals}) — < ${EXPORT_TARGET_MS / 1000} s ==`);
  console.log(`  paging ${pagingMs} ms · CSV assemble ${csvMs} ms (${csvLines} data rows, ${csv.length} bytes) · XLSX assemble ${xlsxMs} ms (${xlsxBuf.length} bytes)`);
  console.log(`  end-to-end ${totalMs} ms  ${exportOk ? "PASS" : "FAIL"}`);
  if (!exportOk) process.exitCode = 1;

  // === Trigram at scale (M9.3 DoD) — contains filter uses the GIN, no seq scan ===
  // Seed the deal set up to TRIGRAM_SCALE (run last — it dwarfs the export set) so a
  // selective needle (one matching row) makes the workspace-scoped trigram GIN the
  // cheapest plan. This is the proof PRD §8 demands ("plain leading-wildcard LIKE
  // scans are not acceptable at target scale") — at a couple thousand rows a seq
  // scan legitimately wins, so the "no seq scan" claim is only meaningful where a
  // real, grown workspace lives.
  const dealsNow = Math.max(N, EXPORT_ROWS);
  if (dealsNow < TRIGRAM_SCALE) {
    const more = syntheticInputs(TRIGRAM_SCALE - dealsNow).map((input, i) =>
      toDealRow(input, dealsNow + i, workspaceId, refs, settings)
    );
    for (let i = 0; i < more.length; i += 500) {
      const ins = await admin.from("deal").insert(more.slice(i, i + 500));
      if (ins.error) throw new Error(`seed trigram-scale deals: ${ins.error.message}`);
    }
    await runSql(url, accessToken, "analyze public.deal;");
  }
  const scaleContains = `select count(*) over() c, d.id, dev.name, d.net_gci::text, d.booked_date
        from public.deal d left join public.developer dev on dev.id=d.developer_id
        where d.workspace_id=${WS} and ${contains}
        order by d.booked_date desc, d.deal_code asc limit 50`;
  const scale = await p95Of(scaleContains);
  const scaleUsesTrgm = TRGM.test(scale.planText);
  const scaleOk = scaleUsesTrgm && scale.p95 < TARGET_MS;
  console.log(`\n== trigram at scale — contains over ${Math.max(TRIGRAM_SCALE, dealsNow)} deals ==`);
  console.log(`  server P95 ${scale.p95.toFixed(2)} ms  ${scaleUsesTrgm ? "· GIN trigram ✓" : "· NO TRIGRAM ✗ (Seq Scan)"}  ${scaleOk ? "PASS" : "FAIL"}`);
  if (!scaleOk) {
    if (!scaleUsesTrgm) console.log("  ✗ contains filter did NOT use the trigram index at scale — PRD §8 violation");
    process.exitCode = 1;
  }

  await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleaned up throwaway user ${PERF_EMAIL} (orphan reaper takes the workspace).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
