"use client";

/**
 * M10.1 — the in-app glossary panel (FR-M10-16, PRD §6.5).
 *
 * Searchable and deep-linkable: every entry is a section keyed by its slug, so
 * /glossary#gci lands on the GCI entry. Search filters on term + definition. Each
 * definition auto-links the OTHER glossary terms it mentions (no self-links), and a
 * "Related" row links the curated cross-references. Read-only reference content.
 */
import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Markdown } from "@/lib/help/markdown";
import { EmptyState } from "@/components/common/empty-state";
import { ROUTES } from "@/lib/routes";
import type { GlossaryEntry } from "@/lib/help/types";

export function GlossaryPanel({ entries }: { entries: GlossaryEntry[] }) {
  const [q, setQ] = React.useState("");

  // On mount, re-scroll to the hash: the entries render client-side, so the browser's
  // initial anchor jump can miss (deep link /glossary#gci).
  React.useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? entries.filter(
        (e) =>
          e.term.toLowerCase().includes(needle) ||
          e.definitionMd.toLowerCase().includes(needle)
      )
    : entries;

  const byKey = new Map(entries.map((e) => [e.key, e]));

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms and definitions…"
          aria-label="Search the glossary"
          data-testid="glossary-search"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No matching terms"
          description="Nothing in the glossary matches your search. Clear it to see every term."
        />
      ) : (
        <dl className="space-y-4">
          {filtered.map((entry) => (
            <section
              key={entry.key}
              id={entry.key}
              data-testid={`glossary-entry-${entry.key}`}
              className="scroll-mt-20 rounded-xl border bg-card p-4"
            >
              <dt className="font-heading text-base font-semibold text-foreground">
                {entry.term}
              </dt>
              <dd className="mt-1.5 text-muted-foreground">
                <Markdown
                  body={entry.definitionMd}
                  // Link other terms mentioned here, never this one (no self-link).
                  glossary={entries.filter((e) => e.key !== entry.key)}
                />
                {entry.relatedKeys.length > 0 && (
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-muted-foreground/70">Related:</span>
                    {entry.relatedKeys.map((key) => {
                      const rel = byKey.get(key);
                      if (!rel) return null;
                      return (
                        <Link
                          key={key}
                          href={`${ROUTES.glossary}#${key}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {rel.term}
                        </Link>
                      );
                    })}
                  </p>
                )}
              </dd>
            </section>
          ))}
        </dl>
      )}
    </div>
  );
}
