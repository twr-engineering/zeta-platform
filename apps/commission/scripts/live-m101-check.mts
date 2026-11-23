/**
 * M10.1 live check — content fidelity + RLS + delta-residue.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m101-check.mts
 *
 * Proves, against the HOSTED Supabase project:
 *   1. the DB-seeded content bundle byte-matches src/lib/help/seed-content.ts (which
 *      the verbatim unit test already ties to PRD §6.3/§6.5 — so DB == TS == PRD);
 *   2. get_active_content_bundle() returns the whole bundle for an AUTHENTICATED user
 *      (RLS SELECT policy), with the fallback graceful for a missing key resolved
 *      client-side (loader concern, not tested here);
 *   3. an authenticated user CANNOT write content (no write policy — rule 11);
 *   4. anon CANNOT read content (SELECT is `to authenticated`);
 *   5. delta-residue: the content tables PERSIST BY DESIGN (product-level seed), and
 *      the throwaway auth user this script creates is reaped afterward.
 *
 * Self-skips when credentials are placeholders.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { HELP_CONTENT_BUNDLE } from "@/lib/help/seed-content";

function env(): Record<string, string> {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const e: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return e;
}

const E = env();
if (
  !E.NEXT_PUBLIC_SUPABASE_URL ||
  !E.SUPABASE_SERVICE_ROLE_KEY ||
  E.SUPABASE_SERVICE_ROLE_KEY.includes("PLACEHOLDER")
) {
  console.log("SKIP: placeholder/absent Supabase credentials");
  process.exit(0);
}

const admin = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "commission" },
  auth: { persistSession: false },
});

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const email = `m101-live-${Date.now()}@throwaway.test`;
const password = "throwaway-m101-live";
let uid = "";

try {
  // --- 1. DB seed byte-matches the TS source (which the unit test ties to the PRD).
  const { data: articles, error: aErr } = await admin
    .from("help_article")
    .select("key, title, body_md, placements")
    .order("key");
  if (aErr) throw aErr;
  check("13 articles seeded", articles?.length === 13, `got ${articles?.length}`);
  let bodyExact = true;
  for (const a of articles ?? []) {
    const src = HELP_CONTENT_BUNDLE.articles.find((x) => x.key === a.key);
    if (!src || src.bodyMd !== a.body_md || src.title !== a.title) {
      bodyExact = false;
      console.log(`   drift at ${a.key}`);
    }
  }
  check("every article body/title byte-matches seed-content.ts (rule 12)", bodyExact);

  const { data: gloss } = await admin
    .from("glossary_entry")
    .select("key, term, definition_md")
    .order("key");
  check("16 glossary entries seeded", gloss?.length === 16, `got ${gloss?.length}`);
  let glossExact = true;
  for (const g of gloss ?? []) {
    const src = HELP_CONTENT_BUNDLE.glossary.find((x) => x.key === g.key);
    if (!src || src.definitionMd !== g.definition_md || src.term !== g.term) glossExact = false;
  }
  check("every glossary definition byte-matches seed-content.ts", glossExact);

  // --- create the throwaway authenticated user
  const { data: made, error: mErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (mErr) throw mErr;
  uid = made.user!.id;

  const asUser = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: "commission" },
    auth: { persistSession: false },
  });
  const { error: signErr } = await asUser.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;

  // --- 2. authenticated RPC returns the whole bundle
  const { data: rpc, error: rpcErr } = await asUser.rpc("get_active_content_bundle");
  check("authenticated get_active_content_bundle() succeeds", !rpcErr, rpcErr?.message ?? "");
  const bundle = rpc as { version: string; articles: unknown[]; glossary: unknown[] } | null;
  check(
    "RPC returns v1.0.0 with 13 articles + 16 glossary",
    bundle?.version === "1.0.0" &&
      bundle?.articles?.length === 13 &&
      bundle?.glossary?.length === 16,
    `v=${bundle?.version} a=${bundle?.articles?.length} g=${bundle?.glossary?.length}`
  );

  // --- 3. authenticated write is denied (no write policy — rule 11)
  const { error: wErr } = await asUser
    .from("glossary_entry")
    .insert({ bundle_id: "00000000-0000-0000-0000-000000000000", key: "hack", term: "x", definition_md: "y" });
  check("authenticated INSERT into glossary_entry is denied", Boolean(wErr), wErr?.message ?? "unexpectedly succeeded");

  // --- 4. anon cannot read content (SELECT is `to authenticated`)
  const anon = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: "commission" },
    auth: { persistSession: false },
  });
  const { data: anonRows } = await anon.from("help_article").select("key");
  check("anon reads zero content rows (RLS)", (anonRows?.length ?? 0) === 0, `got ${anonRows?.length}`);
} catch (err) {
  console.error("ERROR", err);
  failures++;
} finally {
  if (uid) await admin.auth.admin.deleteUser(uid);
}

// --- 5. delta-residue: content persists by design; no throwaway users remain
const { data: bundles } = await admin.from("content_bundle").select("version, status");
check(
  "content bundle persists by design (product-level seed, not delta-residue)",
  (bundles ?? []).some((b) => b.status === "published"),
);
const { data: leftover } = await admin.auth.admin.listUsers();
const stale = (leftover?.users ?? []).filter((u) => u.email?.startsWith("m101-"));
check("no leftover m101 throwaway auth users", stale.length === 0, `found ${stale.length}`);

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
