#!/usr/bin/env node
/**
 * M10.1 — generate the help-content bundle from the PRD, byte-exact.
 *
 *   node scripts/gen-help-content.mjs
 *
 * Single source: discovery/source/M10_PRD.md. This script transcribes the P0–P11
 * doctrine (§6.3), the glossary (§6.5) and the legend line (§6.2) EXACTLY as they
 * appear in the PRD, and writes two artifacts that must never diverge from it:
 *
 *   1. src/lib/help/seed-content.ts   the canonical bundle the app + tests use
 *   2. supabase/migrations/20260719220000_m101_help_content.sql   schema + seed
 *
 * Because both are generated from the PRD, the seeded copy is verbatim by
 * construction; the CI test (tests/unit/help/doctrine-verbatim.test.ts) re-parses
 * the PRD independently and fails if seed-content.ts is ever hand-edited to drift.
 *
 * Re-run this whenever the PRD doctrine changes (a content release, rule 11), then
 * bump BUNDLE_VERSION, re-apply the migration's seed, and republish.
 */
import { readFileSync, writeFileSync } from "node:fs";

const BUNDLE_VERSION = "1.0.0";
const MIGRATION_PATH =
  "supabase/migrations/20260719220000_m101_help_content.sql";
const SEED_TS_PATH = "src/lib/help/seed-content.ts";

// The article key + placement registry, keyed by the PRD's Pn handle. Titles are
// pulled from the PRD headings; placements are the surface slugs M10.4 wires to.
const ARTICLE_META = {
  P0: { key: "philosophy", placements: ["wizard.philosophy", "dashboard.header"] },
  P1: { key: "property-vat", placements: ["deal-form.property-vat", "deal-form.force-vat"] },
  P2: { key: "vat-inclusive-billing", placements: ["deal-form.commission-basis"] },
  P3: { key: "agent-representation", placements: ["deal-form.representation"] },
  P4: { key: "client-counterparty", placements: ["deal-form.client", "deal-form.rate"] },
  P5: { key: "what-to-book", placements: ["deal-form.referral-out"] },
  P6: { key: "corrections-doctrine", placements: ["receivable.corrections"] },
  P7: { key: "booked-vs-collectible", placements: ["receivable.header"] },
  P8: { key: "closed-vs-cancelled", placements: ["receivable.status-dialog"] },
  P9: { key: "balance-basis-taxes", placements: ["dashboard.position", "dashboard.cash-tax"] },
  P10: { key: "mode-of-payment", placements: ["deal-form.mode-of-payment"] },
  P11: { key: "ewt-5-option", placements: ["wizard.tax-review", "settings.tax"] },
};

function slugify(term) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePrd() {
  const md = readFileSync("discovery/source/M10_PRD.md", "utf8");
  const lines = md.split("\n");

  // §6.3 doctrine: `**Pn · Title** — target:` then one blockquote block.
  const doctrine = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\*\*(P\d+)\s+·\s+(.+?)\*\*\s+—\s+.*$/.exec(lines[i]);
    if (!m) continue;
    const body = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    while (j < lines.length && lines[j].startsWith(">")) {
      body.push(lines[j].replace(/^>\s?/, ""));
      j++;
    }
    doctrine.push({ pkey: m[1], title: m[2].trim(), body: body.join("\n") });
  }

  // §6.2 legend verbatim line (first blockquote after the heading).
  let legendLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("### 6.2")) {
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith(">")) j++;
      legendLine = lines[j].replace(/^>\s?/, "");
      break;
    }
  }

  // §6.5 glossary table.
  const glossary = [];
  let inGloss = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("### 6.5")) { inGloss = true; continue; }
    if (inGloss && lines[i].startsWith("### ")) break;
    if (!inGloss) continue;
    const row = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(lines[i]);
    if (!row) continue;
    const term = row[1].trim();
    const def = row[2].trim();
    if (term === "Term" || /^-+$/.test(term)) continue;
    glossary.push({ term, def });
  }

  return { doctrine, legendLine, glossary };
}

/** Build the legend article body — the verbatim §6.2 line + the three affordances. */
function legendBody(legendLine) {
  return [
    `**${legendLine}**`,
    "",
    "Every money surface in the app uses three affordances, so you always know whether a number is yours to change:",
    "",
    "- **Input** — a blue, editable field. This is the only way money enters the system; the account owner types here.",
    "- **Computed** — a locked, read-only value with a lock icon. The engine calculates it; hover to read the formula (e.g. \"GCI = billed ÷ 1.12\"). It is never directly editable.",
    "- **Linked** — a value carried in from another module, marked with a link. Click it to jump to the source.",
  ].join("\n");
}

function buildBundle() {
  const { doctrine, legendLine, glossary } = parsePrd();

  const articles = doctrine.map((d) => {
    const meta = ARTICLE_META[d.pkey];
    if (!meta) throw new Error(`No article meta for ${d.pkey}`);
    return {
      key: meta.key,
      title: d.title,
      bodyMd: d.body,
      placements: meta.placements,
    };
  });

  // The legend explainer — owned content (not rule-12 doctrine), but it embeds the
  // verbatim §6.2 legend line.
  articles.push({
    key: "legend",
    title: "Input vs computed legend",
    bodyMd: legendBody(legendLine),
    placements: ["legend.explainer"],
  });

  // Glossary entries. related_keys are derived: another entry is "related" when any
  // of its aliases appears in this definition (case-insensitive). Aliases split a
  // term on " / " and " vs " so "Referrer vs Referral Out" links on either phrase.
  const entries = glossary.map((g) => ({
    key: slugify(g.term),
    term: g.term,
    definitionMd: g.def,
    aliases: g.term.split(/\s+\/\s+|\s+vs\s+/i).map((a) => a.trim()).filter(Boolean),
  }));

  const glossaryOut = entries.map((e) => {
    const related = entries
      .filter((o) => o.key !== e.key)
      .filter((o) => o.aliases.some((a) => e.definitionMd.toLowerCase().includes(a.toLowerCase())))
      .map((o) => o.key);
    return {
      key: e.key,
      term: e.term,
      definitionMd: e.definitionMd,
      relatedKeys: related,
    };
  });

  return { version: BUNDLE_VERSION, articles, glossary: glossaryOut };
}

function writeSeedTs(bundle) {
  const header = `// AUTO-GENERATED by scripts/gen-help-content.mjs from discovery/source/M10_PRD.md.
// Do NOT edit by hand — edit the PRD and regenerate. The doctrine bodies (P0–P11)
// are byte-exact copies of PRD §6.3 (rule 12); tests/unit/help/doctrine-verbatim
// re-parses the PRD and fails if this file drifts.
import type { ContentBundleData } from "./types";

/**
 * The built-in content bundle (M10 PRD §6.3/§6.5). Two roles:
 *   1. the seed the M10.1 migration ships to the DB (the runtime source of truth);
 *   2. the graceful fallback the loader returns when the DB has no published bundle.
 */
export const HELP_CONTENT_BUNDLE: ContentBundleData = `;
  const json = JSON.stringify(
    { version: bundle.version, articles: bundle.articles, glossary: bundle.glossary },
    null,
    2
  );
  writeFileSync(SEED_TS_PATH, `${header}${json};\n`);
  console.log(`wrote ${SEED_TS_PATH}`);
}

/** Dollar-quote a string for SQL (bodies contain quotes, →, ₱, — etc.). */
function dq(s) {
  return `$md$${s}$md$`;
}

/** array['a','b']::text[] literal from a JS string array. */
function pgArray(arr) {
  if (arr.length === 0) return "array[]::text[]";
  return `array[${arr.map((a) => dq(a)).join(", ")}]::text[]`;
}

function writeMigration(bundle) {
  const articleValues = bundle.articles
    .map(
      (a) =>
        `    (v_bundle, ${dq(a.key)}, ${dq(a.title)}, ${dq(a.bodyMd)}, ${pgArray(a.placements)})`
    )
    .join(",\n");
  const glossaryValues = bundle.glossary
    .map(
      (g) =>
        `    (v_bundle, ${dq(g.key)}, ${dq(g.term)}, ${dq(g.definitionMd)}, ${pgArray(g.relatedKeys)})`
    )
    .join(",\n");

  const sql = `-- =============================================================================
-- M10.1 — Help-content system: product-level versioned content bundle
-- =============================================================================
-- ADDITIVE ONLY. M10 (Onboarding & In-App Guidance) owns NO financial logic and no
-- money columns (M10 PRD §3, "M10 owns no financial logic"). This migration adds the
-- PRODUCT-level content store — HelpArticle + GlossaryEntry grouped into an immutable,
-- semver'd bundle (§3.3–3.4) — plus the read RPC the runtime loader caches.
--
-- PRODUCT-level, not workspace-scoped: the same doctrine copy serves every tenant.
-- So there is no workspace_id and no tenant RLS predicate here; instead:
--   * SELECT is granted to every authenticated user (content is readable by all);
--   * there is NO insert/update/delete policy, so the PostgREST/anon/authenticated
--     roles can NEVER write content. Content ships ONLY via migration or the
--     service-role publish path (which bypasses RLS). See the publish procedure below.
--
-- Versioning (rule 11): bundles are immutable once published; the app pins the
-- latest published bundle (get_active_content_bundle). A doctrine change is a NEW
-- bundle row + its own articles/glossary + a status flip to 'published' — a content
-- release independent of any application deploy (NFR 2 / AC 9). Rollback = publish a
-- prior version (flip the old row back to 'published', or insert it again).
--
-- Seed content (P0–P11 + glossary + legend) is generated byte-exact from PRD §6.3/§6.5
-- by scripts/gen-help-content.mjs (rule 12, doctrine verbatim). Do not hand-edit the
-- seed VALUES below — regenerate.
-- =============================================================================

-- 1. Bundle status enum --------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_bundle_status') then
    create type commission.content_bundle_status as enum ('draft', 'published', 'archived');
  end if;
end
$$;

-- 2. Tables --------------------------------------------------------------------
-- A content release. Immutable once published; created_at + published_at only (no
-- updated_at — a published bundle is never mutated, it is superseded).
create table if not exists commission.content_bundle (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  status commission.content_bundle_status not null default 'draft',
  changelog text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table commission.content_bundle is
  'M10.1: a versioned, immutable help-content release (PRD §3.3, rule 11). Product-level. The app pins the latest status=published row.';

-- Only one published bundle per version (republish = new row of a new version, or a
-- status flip; a version string identifies one immutable payload).
create unique index if not exists content_bundle_published_version_idx
  on commission.content_bundle (version)
  where status = 'published';

create table if not exists commission.help_article (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references commission.content_bundle (id) on delete cascade,
  key text not null,
  title text not null,
  body_md text not null,
  placements text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  unique (bundle_id, key)
);

comment on table commission.help_article is
  'M10.1: a help/doctrine article within a bundle (PRD §3.3). body_md is verbatim doctrine for P0–P11 (rule 12). placements = surface slugs where it appears.';

create table if not exists commission.glossary_entry (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references commission.content_bundle (id) on delete cascade,
  key text not null,
  term text not null,
  definition_md text not null,
  related_keys text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  unique (bundle_id, key)
);

comment on table commission.glossary_entry is
  'M10.1: an in-app glossary term within a bundle (PRD §3.4/§6.5). Deep-linkable at /glossary#<key>.';

-- 3. RLS: readable by all authenticated users, writable by nobody via the API ---
alter table commission.content_bundle enable row level security;
alter table commission.help_article enable row level security;
alter table commission.glossary_entry enable row level security;

drop policy if exists content_bundle_read on commission.content_bundle;
create policy content_bundle_read on commission.content_bundle
  for select to authenticated using (true);

drop policy if exists help_article_read on commission.help_article;
create policy help_article_read on commission.help_article
  for select to authenticated using (true);

drop policy if exists glossary_entry_read on commission.glossary_entry;
create policy glossary_entry_read on commission.glossary_entry
  for select to authenticated using (true);
-- (No INSERT/UPDATE/DELETE policies by design — content writes are migration /
--  service-role only. RLS with no write policy = deny for authenticated/anon.)

-- 4. Read RPC — the runtime loader caches this (one round-trip, whole bundle) -----
-- security invoker so the SELECT policy applies; returns the latest published bundle
-- as one jsonb payload (version + articles + glossary), or NULL when none is
-- published yet (the loader then falls back to the app's built-in bundle).
create or replace function commission.get_active_content_bundle()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'version', b.version,
    'bundleId', b.id,
    'publishedAt', b.published_at,
    'articles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', a.key, 'title', a.title, 'bodyMd', a.body_md, 'placements', a.placements
        ) order by a.key
      )
      from commission.help_article a where a.bundle_id = b.id
    ), '[]'::jsonb),
    'glossary', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', g.key, 'term', g.term, 'definitionMd', g.definition_md, 'relatedKeys', g.related_keys
        ) order by g.term
      )
      from commission.glossary_entry g where g.bundle_id = b.id
    ), '[]'::jsonb)
  )
  from commission.content_bundle b
  where b.status = 'published'
  order by b.published_at desc nulls last, b.created_at desc
  limit 1
$$;

comment on function commission.get_active_content_bundle() is
  'M10.1: the latest published content bundle as jsonb (PRD §3.3, FR-M10-17). NULL when none published — caller falls back to the built-in bundle.';

grant execute on function commission.get_active_content_bundle() to authenticated;

-- 5. Seed the initial published bundle (v${bundle.version}) ----------------------------------
-- Generated byte-exact from PRD §6.3/§6.5 by scripts/gen-help-content.mjs. Idempotent:
-- re-applying does nothing if this version is already published.
do $$
declare
  v_bundle uuid;
begin
  if exists (
    select 1 from commission.content_bundle
    where version = ${dq(bundle.version)} and status = 'published'
  ) then
    return;
  end if;

  insert into commission.content_bundle (version, status, changelog, published_at)
  values (${dq(bundle.version)}, 'published', 'Initial M10.1 doctrine bundle (P0–P11), glossary and legend.', now())
  returning id into v_bundle;

  insert into commission.help_article (bundle_id, key, title, body_md, placements) values
${articleValues};

  insert into commission.glossary_entry (bundle_id, key, term, definition_md, related_keys) values
${glossaryValues};
end
$$;

-- =============================================================================
-- PUBLISH PROCEDURE (no application deploy — NFR 2 / AC 9)
-- -----------------------------------------------------------------------------
-- To ship a doctrine correction or a new bundle version:
--   1. Edit discovery/source/M10_PRD.md (the doctrine source of truth), then run
--      \`node scripts/gen-help-content.mjs\` and bump BUNDLE_VERSION.
--   2. Apply the generated seed block against the hosted DB via the Supabase
--      Management API (service role — bypasses RLS), e.g. POST .../database/query
--      with the INSERTs for the new content_bundle (status='published') + its
--      articles/glossary. No app deploy, no code release.
--   3. Running clients pick it up within the loader cache TTL (< 5 min, FR-M10-17):
--      get_active_content_bundle() returns the newest published row.
--   4. Rollback = re-publish the prior version (insert/flip its row to 'published');
--      the loader always takes the most recent published_at.
-- Bundles are immutable: never UPDATE a published article's body — supersede it with
-- a new bundle so version history is retained (rule 11).
-- =============================================================================
`;
  writeFileSync(MIGRATION_PATH, sql);
  console.log(`wrote ${MIGRATION_PATH}`);
}

const bundle = buildBundle();
writeSeedTs(bundle);
writeMigration(bundle);
console.log(
  `bundle v${bundle.version}: ${bundle.articles.length} articles, ${bundle.glossary.length} glossary entries`
);
