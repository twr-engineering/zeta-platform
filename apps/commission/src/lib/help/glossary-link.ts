/**
 * M10.1 — glossary auto-linking (FR-M10-16, PRD §6.5).
 *
 * Any glossary term appearing in help copy becomes a link to /glossary#<key>. This
 * is a RENDER-time transform only — the stored `bodyMd` bytes never change, so the
 * doctrine-verbatim guarantee (rule 12) holds while the reader still gets the links.
 *
 * Pure and framework-free so it is unit-testable: it turns a text run into typed
 * segments; the markdown renderer maps link segments to anchors.
 */
import type { GlossaryEntry } from "./types";

/** An alias phrase that resolves to a glossary key (e.g. "NET GCI" → "net-gci"). */
export type GlossaryAlias = { alias: string; key: string; length: number };

/** A rendered slice of a text run: plain text, or a link to a glossary entry. */
export type LinkSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; key: string };

/** Escape a phrase for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the alias index for a glossary. A term contributes one alias per segment
 * when split on " / " or " vs " ("Referrer vs Referral Out" links on either side;
 * "TCP / List Price" on either name). Aliases are sorted longest-first so a longer
 * phrase wins over a shorter one that starts at the same place.
 */
export function buildGlossaryIndex(glossary: GlossaryEntry[]): GlossaryAlias[] {
  const seen = new Set<string>();
  const aliases: GlossaryAlias[] = [];
  for (const entry of glossary) {
    const parts = entry.term.split(/\s+\/\s+|\s+vs\s+/i);
    for (const raw of parts) {
      const alias = raw.trim();
      if (alias.length < 2) continue;
      const dedupeKey = alias.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      aliases.push({ alias, key: entry.key, length: alias.length });
    }
  }
  return aliases.sort((a, b) => b.length - a.length);
}

// A phrase boundary that does not consume the surrounding character (so adjacent
// punctuation still renders). We treat letters/digits as "inside a word".
function boundedMatch(text: string, alias: string): number {
  const re = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(alias)})(?![A-Za-z0-9])`, "i");
  const m = re.exec(text);
  if (!m) return -1;
  // Offset past the (non-consumed) leading boundary char.
  return m.index + m[1].length;
}

/**
 * Linkify one text run. Each glossary key links at most once per article — pass a
 * shared `used` Set across the whole article so a term is not linked repeatedly.
 * Matching is case-insensitive and word-bounded; when several aliases match, the one
 * starting earliest (ties → longest) wins.
 */
export function linkifyRun(
  text: string,
  index: GlossaryAlias[],
  used: Set<string>
): LinkSegment[] {
  if (!text) return [];

  // Find the earliest, longest still-unused alias match in the whole run.
  let best: { start: number; alias: GlossaryAlias } | null = null;
  for (const alias of index) {
    if (used.has(alias.key)) continue;
    const at = boundedMatch(text, alias.alias);
    if (at === -1) continue;
    if (
      best === null ||
      at < best.start ||
      (at === best.start && alias.length > best.alias.length)
    ) {
      best = { start: at, alias };
    }
  }

  if (!best) return [{ kind: "text", value: text }];

  used.add(best.alias.key);
  const end = best.start + best.alias.alias.length;
  const segments: LinkSegment[] = [];
  if (best.start > 0) segments.push({ kind: "text", value: text.slice(0, best.start) });
  segments.push({ kind: "link", value: text.slice(best.start, end), key: best.alias.key });
  // Recurse on the tail so multiple distinct terms in one run all link.
  return segments.concat(linkifyRun(text.slice(end), index, used));
}
