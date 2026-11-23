#!/usr/bin/env node
/**
 * Dev fixtures (M0.1 deliverable: "CI + migrations + seed script for dev
 * fixtures").
 *
 *   node scripts/seed-dev.mjs           create/ensure the fixture agents
 *   node scripts/seed-dev.mjs --delete  remove them and their workspaces
 *   node scripts/seed-dev.mjs --check   report what exists, change nothing
 *
 * The fixtures are M0.1's demo script, verbatim: two agents in two workspaces,
 * which is what makes tenant isolation (AC9) demonstrable rather than asserted.
 *
 * WHAT THIS DOES NOT DO — it never inserts a workspace, membership, or
 * tax_settings row itself. It creates *users* and lets the signup bootstrap
 * trigger do the rest, so seeding exercises the same path a real signup takes.
 * A seed that hand-built those rows could drift from the trigger and would
 * happily "pass" against a bootstrap that is broken.
 *
 * It also seeds no Property Types, Developers or Lead Sources: M0 rule 11 says
 * workspace creation seeds nothing silently, and the seed-offer flow is M0.3's.
 *
 * Uses the service-role key, so it bypasses RLS. Development only — never point
 * it at production.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const FIXTURES = [
  { email: "agent@solo.test", password: "zeta-dev-password", displayName: "JD" },
  {
    email: "agent2@solo.test",
    password: "zeta-dev-password",
    displayName: "Maria",
  },
  // M1.3: a third workspace dedicated to the deal specs. Playwright runs files
  // in parallel, and both configuration-lists (JD) and the deal specs need to
  // accept the workbook seed offer on an EMPTY list — sharing a workspace would
  // race them over that one empty-list moment. Its own agent keeps the deal
  // form/list specs isolated (and its tax settings stable, unlike Maria's).
  {
    email: "agent3@solo.test",
    password: "zeta-dev-password",
    displayName: "Dealer",
  },
];

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    fail(".env.local not found. Copy .env.example and fill in Supabase credentials.");
  }

  const env = {};
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;

if (!url || url === "PLACEHOLDER_PENDING_CREDENTIALS") {
  fail("NEXT_PUBLIC_SUPABASE_URL is not set to a real project in .env.local.");
}
if (!serviceKey || serviceKey === "PLACEHOLDER_PENDING_CREDENTIALS") {
  fail("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local.");
}

// A production URL here would mean creating users in a live project — the one
// mistake this script must not make quietly.
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  fail(`NEXT_PUBLIC_SUPABASE_URL does not look like a Supabase project: ${url}`);
}

const admin = createClient(url, serviceKey, {
  db: { schema: "commission" },
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUser(email) {
  // listUsers is paginated; the fixture set is tiny, so one page is plenty.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) fail(`Could not list users: ${error.message}`);
  return data.users.find((user) => user.email === email) ?? null;
}

async function describeWorkspace(userId) {
  const { data: membership } = await admin
    .from("membership")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) return null;

  const { data: workspace } = await admin
    .from("workspace")
    .select("name, currency, timezone, deal_id_sequence")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  // ::text on the rates — PostgREST would hand these back as JSON floats
  // otherwise (see src/lib/supabase/selects.ts). A seed script that printed
  // 0.1 would quietly teach the wrong lesson about how this data is read.
  const { data: tax } = await admin
    .from("tax_settings")
    .select(
      "vat_rate::text, ewt_rate::text, property_vat_threshold::text, chase_idle_months"
    )
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  return { role: membership.role, workspace, tax };
}

async function report(user) {
  const detail = await describeWorkspace(user.id);
  if (!detail) {
    console.log(`    ⚠ no membership — the signup bootstrap did not run`);
    return;
  }
  const { workspace, tax, role } = detail;
  console.log(
    `    workspace "${workspace.name}" · ${workspace.currency} · ${workspace.timezone} · seq ${workspace.deal_id_sequence} · role ${role}`
  );
  console.log(
    `    tax: VAT ${tax.vat_rate} · EWT ${tax.ewt_rate} · threshold ${tax.property_vat_threshold} · chase ${tax.chase_idle_months}mo`
  );
}

async function seed() {
  for (const fixture of FIXTURES) {
    const existing = await findUser(fixture.email);

    if (existing) {
      console.log(`= ${fixture.email} already exists (${existing.id})`);
      await report(existing);
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: fixture.email,
      password: fixture.password,
      // Dev fixtures skip the mailbox round trip. Real signups do NOT:
      // mailer_autoconfirm is false on the project, per FR-M0-01.
      email_confirm: true,
      // Read by the signup bootstrap trigger to name the workspace (M0 §3.1).
      user_metadata: { display_name: fixture.displayName },
    });

    if (error) fail(`Could not create ${fixture.email}: ${error.message}`);

    console.log(`+ created ${fixture.email} (${data.user.id})`);
    await report(data.user);
  }

  console.log(`\nSign in at http://localhost:3000/login`);
  for (const fixture of FIXTURES) {
    console.log(`  ${fixture.email} / ${fixture.password}`);
  }
}

async function remove() {
  for (const fixture of FIXTURES) {
    const existing = await findUser(fixture.email);
    if (!existing) {
      console.log(`= ${fixture.email} not present`);
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(existing.id);
    if (error) fail(`Could not delete ${fixture.email}: ${error.message}`);
    console.log(`- deleted ${fixture.email}`);
  }

  // The orphan reaper fires on last-member-out; if it ever regresses, a deleted
  // fixture would strand a workspace holding financial data (M0.4's guarantee).
  const { count } = await admin
    .from("workspace")
    .select("id", { count: "exact", head: true });
  console.log(`\nWorkspaces remaining: ${count ?? 0}`);
}

async function check() {
  for (const fixture of FIXTURES) {
    const existing = await findUser(fixture.email);
    if (!existing) {
      console.log(`= ${fixture.email} not present`);
      continue;
    }
    console.log(`= ${fixture.email} (${existing.id})`);
    await report(existing);
  }
}

const mode = process.argv.includes("--delete")
  ? remove
  : process.argv.includes("--check")
    ? check
    : seed;

await mode();
