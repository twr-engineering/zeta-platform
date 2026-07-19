/**
 * M10.1 — placement registry + article resolvers (FR-M10-11, PRD §6.3).
 *
 * A "placement" is a stable slug for a surface where a help article appears — a
 * field-level "?" trigger, a dialog, a dashboard section. Articles declare the
 * placements they serve (`HelpArticle.placements`); this registry documents what
 * each placement IS, so M10.4 can wire triggers to surfaces and an audit can prove
 * every placement resolves. The registry is the contract M10.2–M10.4 consume.
 *
 * Nothing here is workspace- or money-aware: it maps slugs to articles, full stop.
 */
import type { ContentBundleData, GlossaryEntry, HelpArticle } from "./types";

/** What a placement slug points at — for docs, the audit, and M10.4 wiring. */
export type PlacementSurface = {
  /** Owning module (M0, M1, M4, M6, M10 …). */
  module: string;
  /** Human description of the surface. */
  surface: string;
};

/**
 * The canonical placement → surface map (PRD §6.3 targets). Adding a placement here
 * without an article that serves it (or vice-versa) is what the registry-coverage
 * checks catch. Keys are dot-namespaced by owning surface.
 */
export const PLACEMENT_REGISTRY: Record<string, PlacementSurface> = {
  "wizard.philosophy": { module: "M10", surface: "First-run wizard — philosophy interstitial before the fork" },
  "dashboard.header": { module: "M6", surface: "Dashboard header \"?\"" },
  "deal-form.property-vat": { module: "M1", surface: "Deal form — Property VAT badge" },
  "deal-form.force-vat": { module: "M1", surface: "Deal form — Force VAT toggle" },
  "deal-form.commission-basis": { module: "M1", surface: "Deal form — commission section (VAT-inclusive billing)" },
  "deal-form.representation": { module: "M1", surface: "Deal form — Agent Representation picker" },
  "deal-form.client": { module: "M1", surface: "Deal form — Client / Counterparty field" },
  "deal-form.rate": { module: "M1", surface: "Deal form — Rate % field" },
  "deal-form.referral-out": { module: "M1", surface: "Deal form — Referral Out section" },
  "deal-form.mode-of-payment": { module: "M1", surface: "Deal form — Mode of Payment field" },
  "receivable.corrections": { module: "M4", surface: "Receivable view — corrections doctrine + mini-flow" },
  "receivable.header": { module: "M4", surface: "Receivable header — Booked vs Collectible" },
  "receivable.status-dialog": { module: "M4", surface: "Receivable status-change dialog — Closed vs Cancelled" },
  "dashboard.position": { module: "M6", surface: "Dashboard — Position section" },
  "dashboard.cash-tax": { module: "M6", surface: "Dashboard — Cash & Tax section" },
  "settings.tax": { module: "M0", surface: "Tax settings — EWT 5% option" },
  "wizard.tax-review": { module: "M10", surface: "Wizard step 2 — tax settings review" },
  "legend.explainer": { module: "M10", surface: "Legend \"?\" explainer on every table/form header" },
};

/** A minimal shape both ContentBundle and ContentBundleData satisfy. */
type ResolvableBundle = Pick<ContentBundleData, "articles" | "glossary">;

/**
 * The graceful fallback for a missing article (rule: a missing article renders a
 * glossary link, never a broken popover — PRD §3.3). It is a real HelpArticle so
 * callers need no null branch.
 */
export function fallbackArticle(key: string): HelpArticle {
  return {
    key,
    title: "Help",
    bodyMd:
      "This help topic isn’t available yet. Open the [glossary](/glossary) for definitions of the terms used here.",
    placements: [],
  };
}

/** Resolve an article by its key, or the fallback (never null). */
export function getArticle(bundle: ResolvableBundle, key: string): HelpArticle {
  return bundle.articles.find((a) => a.key === key) ?? fallbackArticle(key);
}

/**
 * Resolve the article serving a placement slug, or the fallback. First article whose
 * `placements` contains the slug wins (each slug is served by exactly one article in
 * the seed bundle).
 */
export function articleForPlacement(
  bundle: ResolvableBundle,
  placement: string
): HelpArticle {
  return (
    bundle.articles.find((a) => a.placements.includes(placement)) ??
    fallbackArticle(placement)
  );
}

/** Resolve a glossary entry by key (or null — the glossary page handles absence). */
export function getGlossaryEntry(
  bundle: ResolvableBundle,
  key: string
): GlossaryEntry | null {
  return bundle.glossary.find((g) => g.key === key) ?? null;
}
