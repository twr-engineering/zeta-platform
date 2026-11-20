/**
 * M10.1 — help-content system shared types (M10 PRD §3.3–3.4).
 *
 * Content is PRODUCT-level (not workspace-scoped) and ships as a versioned,
 * immutable bundle: a set of HelpArticles + GlossaryEntries under one semver.
 * The client loads one published bundle and renders its articles through the
 * placement registry (§6.3) and the glossary panel (§6.5). M10 owns no money
 * and computes nothing — these are content shapes only.
 */

/**
 * A single doctrine / help article. `bodyMd` is markdown; for the P0–P11 doctrine
 * articles it is the Start Here text VERBATIM (rule 12 — a CI test byte-matches it
 * against the PRD). Glossary terms appearing in `bodyMd` auto-link at render time
 * (the stored bytes never change). `placements` are the surface keys where the
 * article appears (see the placement registry).
 */
export type HelpArticle = {
  key: string;
  title: string;
  bodyMd: string;
  placements: string[];
};

/**
 * A glossary term (§6.5). `definitionMd` is markdown; `relatedKeys` point at other
 * glossary entries (rendered as "Related" links on the glossary panel).
 */
export type GlossaryEntry = {
  key: string;
  term: string;
  definitionMd: string;
  relatedKeys: string[];
};

/**
 * One published (or bundled-default) content release. `version` is the semver the
 * app pins; `bundleId`/`publishedAt` are null for the built-in fallback bundle that
 * ships in the app itself (used when the DB has no published bundle yet).
 */
export type ContentBundle = {
  version: string;
  bundleId: string | null;
  publishedAt: string | null;
  articles: HelpArticle[];
  glossary: GlossaryEntry[];
};

/** The authored bundle payload before it is given a DB identity (seed source). */
export type ContentBundleData = {
  version: string;
  articles: HelpArticle[];
  glossary: GlossaryEntry[];
};
