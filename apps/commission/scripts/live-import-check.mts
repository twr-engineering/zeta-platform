/**
 * Headless end-to-end proof of the M1.4 import DB path in a THROWAWAY workspace.
 * Creates a throwaway user (signup bootstrap makes their empty workspace), imports
 * the REAL v30.20 workbook through run_workbook_import as that user, asserts the §9
 * anchors, idempotency, code preservation + next-code, and mismatch reporting, then
 * deletes the user (cascading the workspace away — delta-residue zero).
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-import-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseWorkbook } from "@/lib/import/parse";
import { buildImportPlan } from "@/lib/import/build";
import { sha256Hex } from "@/lib/import/hash";

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

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const email = `import-check-${Date.now()}@throwaway.test`;
const password = "throwaway-import-check-pw";

let uid = "";
const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

async function main() {
  // 1) throwaway user → signup bootstrap creates their empty workspace + tax settings.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  uid = created.data.user!.id;

  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  // 2) parse + compute + reconcile the REAL workbook (offline), then import.
  const bytes = new Uint8Array(readFileSync(FILE));
  const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
  check("offline reconciliation clean", plan.mismatches.length === 0, `${plan.mismatches.length} mismatches`);

  const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  if (run.error) throw run.error;
  const res = run.data as { ok: boolean; summary?: Record<string, unknown> };
  check("run_workbook_import ok", res.ok === true, JSON.stringify(res.summary));

  // 3) deals: 21 rows, codes D001–D021 preserved, gapless here.
  const deals = await user
    .from("deal")
    .select("deal_code")
    .order("deal_code", { ascending: true });
  const codes = (deals.data ?? []).map((d) => d.deal_code);
  check("21 deals imported", codes.length === 21, `${codes.length}`);
  const expectCodes = Array.from({ length: 21 }, (_, i) => `D${String(i + 1).padStart(3, "0")}`);
  check("codes D001–D021 preserved", JSON.stringify(codes) === JSON.stringify(expectCodes));

  // 4) receivables: Σ total_collectible = 6,763,497.25; 7 Closed.
  const recv = await user.from("receivable").select("total_collectible::text,status");
  const rows = (recv.data ?? []) as { total_collectible: string; status: string }[];
  const sumTotal = rows.reduce((a, r) => a + Number(r.total_collectible), 0).toFixed(2);
  const closed = rows.filter((r) => r.status === "closed").length;
  check("Σ total_collectible = 6763497.25", sumTotal === "6763497.25", sumTotal);
  check("7 receivables Closed", closed === 7, `${closed}`);
  check("21 receivables (one per deal)", rows.length === 21, `${rows.length}`);

  // 5) payments: 8 rows, Σ net_of_vat = 1,908,192.86.
  const pays = await user.from("payment").select("net_of_vat::text");
  const prows = (pays.data ?? []) as { net_of_vat: string }[];
  const sumNet = prows.reduce((a, r) => a + Number(r.net_of_vat), 0).toFixed(2);
  check("8 payments imported", prows.length === 8, `${prows.length}`);
  check("Σ payment net collected = 1908192.86", sumNet === "1908192.86", sumNet);

  // 6) D021 booked NET GCI to the centavo.
  const d21 = await user.from("deal").select("net_gci::text,vat_memo::text,ewt_memo::text").eq("deal_code", "D021").single();
  check("D021 NET GCI 354591.84", (d21.data as { net_gci: string }).net_gci === "354591.84");

  // 7) sequence advanced: workspace.deal_id_sequence = 21 → next new deal is D022.
  const ws = await user.from("workspace").select("deal_id_sequence").single();
  check("sequence advanced to 21 (next = D022)", (ws.data as { deal_id_sequence: number }).deal_id_sequence === 21);

  // 8) settings/lists landed (Megaworld GERI = Gross).
  const dev = await user.from("developer").select("name,comm_base").eq("name", "Megaworld GERI").single();
  check("Megaworld GERI = Gross", (dev.data as { comm_base: string })?.comm_base === "gross");

  // 9) idempotency: re-run same file → refused.
  const again = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
  check("re-import refused (already_imported)", (again.data as { reason?: string })?.reason === "already_imported", JSON.stringify(again.data));

  // 10) mismatch injection — tamper one cached figure and reconcile: the row is
  // REPORTED, not imported. (Mutates the parsed cache, the same input the app
  // reconciles against; the reconcile unit test covers the pure comparator too.)
  const tamperedWb = await parseWorkbook(bytes);
  const d21row = tamperedWb.deals.find((d) => d.deal_code === "D021")!;
  d21row.cached.gci_net_of_vat = "999999.99";
  const tamperedPlan = buildImportPlan(tamperedWb, "tampered-hash", "tampered.xlsx");
  const reported = tamperedPlan.mismatches.find((m) => m.code === "D021" && m.field === "gci_net_of_vat");
  check("tampered D021 GCI reported as a mismatch", Boolean(reported), JSON.stringify(reported));

  console.log(fails.length ? `\n❌ ${fails.length} FAILED: ${fails.join(", ")}` : "\n✅ ALL LIVE DB CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message ?? e);
    fails.push("threw");
  })
  .finally(async () => {
    if (uid) {
      await admin.auth.admin.deleteUser(uid);
      console.log("cleaned up throwaway user (workspace cascaded away)");
    }
    process.exit(fails.length ? 1 : 0);
  });
