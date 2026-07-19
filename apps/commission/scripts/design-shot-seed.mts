/**
 * DESIGN PASS helper (not shipped, not CI). Provisions a THROWAWAY workspace
 * with the real v30.20 workbook imported, so the Playwright screenshot sweep can
 * log into the dev server and see every surface with real money on it.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/design-shot-seed.mts         # create
 *   node --import ./tests/alias-hooks.mjs scripts/design-shot-seed.mts --delete # reap
 *
 * Credentials are written to the scratchpad JSON the Playwright script reads.
 * Reap deletes the throwaway user (membership-delete trigger reaps the whole
 * workspace) → delta-residue zero. Touches only *@throwaway.test.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
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
const CRED = "/private/tmp/claude-501/-Users-juliusbaliling-Projects-nurture-your-commission/52df508a-bedb-4353-8acf-d26690529daf/scratchpad/design-shot-cred.json";

if (!URL_ || !SERVICE || SERVICE.includes("PLACEHOLDER")) {
  console.log("SKIP: placeholder/absent Supabase credentials");
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

if (process.argv.includes("--delete")) {
  if (existsSync(CRED)) {
    const { uid } = JSON.parse(readFileSync(CRED, "utf8"));
    if (uid) {
      await admin.auth.admin.deleteUser(uid);
      console.log("reaped throwaway user (workspace cascaded away)");
    }
    unlinkSync(CRED);
  }
  // Belt-and-braces: sweep any stray design-shot users.
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith("design-shot-")) {
      await admin.auth.admin.deleteUser(u.id);
      console.log(`reaped stray ${u.email}`);
    }
  }
  process.exit(0);
}

const email = `design-shot-${Date.now()}@throwaway.test`;
const password = "throwaway-design-shot-pw";

const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const uid = created.data.user!.id;

const user = createClient(URL_, ANON, { auth: { persistSession: false } });
const signIn = await user.auth.signInWithPassword({ email, password });
if (signIn.error) throw signIn.error;

const bytes = new Uint8Array(readFileSync(FILE));
const plan = buildImportPlan(await parseWorkbook(bytes), sha256Hex(bytes), "v30.20.xlsx");
const run = await user.rpc("run_workbook_import", { p_payload: plan.payload as never });
if (run.error) throw run.error;

writeFileSync(CRED, JSON.stringify({ email, password, uid }, null, 2));
console.log(`seeded ${email}\ncredentials → ${CRED}`);
process.exit(0);
