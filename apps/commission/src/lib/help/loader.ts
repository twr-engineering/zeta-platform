import "server-only";

/**
 * M10.1 — the content loader (FR-M10-17, NFR 2).
 *
 * Loads the latest PUBLISHED content bundle from the DB (get_active_content_bundle)
 * and caches it in-process with a short TTL, so:
 *   * popovers open from memory (< 100 ms — no round-trip on the hot path);
 *   * a republished bundle propagates to running servers within the TTL (< 5 min)
 *     with no application deploy (rule 11 / AC 9).
 *
 * When the DB has no published bundle (fresh project) or the read fails, it falls
 * back to the app's built-in bundle (seed-content) — help is never broken, and the
 * glossary/doctrine still render. M10 reads no money and computes nothing.
 */
import { createClient } from "@/lib/supabase/server";
import { HELP_CONTENT_BUNDLE } from "./seed-content";
import type { ContentBundle } from "./types";

/** Propagation budget for a republished bundle (NFR: < 5 min). */
const CACHE_TTL_MS = 4 * 60 * 1000;

type CacheSlot = { bundle: ContentBundle; fetchedAt: number };
let cache: CacheSlot | null = null;

/** The built-in bundle as a ContentBundle (no DB identity). */
function builtInBundle(): ContentBundle {
  return {
    version: HELP_CONTENT_BUNDLE.version,
    bundleId: null,
    publishedAt: null,
    articles: HELP_CONTENT_BUNDLE.articles,
    glossary: HELP_CONTENT_BUNDLE.glossary,
  };
}

/** Shape returned by get_active_content_bundle() (jsonb). */
type ActiveBundleRow = {
  version: string;
  bundleId: string | null;
  publishedAt: string | null;
  articles: ContentBundle["articles"];
  glossary: ContentBundle["glossary"];
} | null;

async function fetchBundle(): Promise<ContentBundle> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_active_content_bundle");
    if (error || !data) return builtInBundle();
    const row = data as ActiveBundleRow;
    if (!row || !Array.isArray(row.articles) || row.articles.length === 0) {
      return builtInBundle();
    }
    return {
      version: row.version,
      bundleId: row.bundleId,
      publishedAt: row.publishedAt,
      articles: row.articles,
      glossary: Array.isArray(row.glossary) ? row.glossary : [],
    };
  } catch {
    // Never let a content read break a page — fall back to the built-in bundle.
    return builtInBundle();
  }
}

/**
 * The active content bundle, cached for CACHE_TTL_MS. Callers (the app layout, the
 * /glossary page, the /api/help/content route) get an already-resolved bundle on the
 * hot path; the client provider is seeded from this so popovers never wait.
 */
export async function getActiveContentBundle(): Promise<ContentBundle> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.bundle;
  const bundle = await fetchBundle();
  cache = { bundle, fetchedAt: now };
  return bundle;
}

/** Test/ops seam — drop the cache so the next read re-fetches. */
export function clearContentBundleCache(): void {
  cache = null;
}
