"use client";

/**
 * M10.1 — the client help-content provider (FR-M10-11/16/17).
 *
 * Seeded server-side from the app layout with the already-resolved bundle, so every
 * popover on the page renders from memory the instant it opens (< 100 ms — no fetch
 * on the hot path). A background interval revalidates against /api/help/content so a
 * republished bundle reaches a long-lived session within the cache TTL (< 5 min) with
 * no reload (rule 11 / AC 9). Read-only; no money anywhere.
 */
import * as React from "react";

import { articleForPlacement, getArticle } from "@/lib/help/placements";
import type { ContentBundle, GlossaryEntry, HelpArticle } from "@/lib/help/types";

const REVALIDATE_MS = 4 * 60 * 1000;

type HelpContextValue = {
  version: string;
  glossary: GlossaryEntry[];
  getArticle: (key: string) => HelpArticle;
  articleForPlacement: (placement: string) => HelpArticle;
};

const HelpContext = React.createContext<HelpContextValue | null>(null);

export function HelpContentProvider({
  initial,
  children,
}: {
  initial: ContentBundle;
  children: React.ReactNode;
}) {
  const [bundle, setBundle] = React.useState<ContentBundle>(initial);

  React.useEffect(() => {
    let active = true;
    const revalidate = async () => {
      try {
        const res = await fetch("/api/help/content", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as ContentBundle;
        if (active && next?.version && Array.isArray(next.articles)) setBundle(next);
      } catch {
        // A failed revalidation just keeps the current bundle — help never breaks.
      }
    };
    const id = setInterval(revalidate, REVALIDATE_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const value = React.useMemo<HelpContextValue>(
    () => ({
      version: bundle.version,
      glossary: bundle.glossary,
      getArticle: (key) => getArticle(bundle, key),
      articleForPlacement: (placement) => articleForPlacement(bundle, placement),
    }),
    [bundle]
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelpContent(): HelpContextValue {
  const ctx = React.useContext(HelpContext);
  if (!ctx) {
    throw new Error("useHelpContent must be used within a HelpContentProvider");
  }
  return ctx;
}
