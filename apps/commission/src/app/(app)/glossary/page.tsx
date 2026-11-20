import type { Metadata } from "next";

import { GlossaryPanel } from "@/components/glossary/glossary-panel";
import { LegendExplainer } from "@/components/help/legend-explainer";
import { getActiveContentBundle } from "@/lib/help/loader";

export const metadata: Metadata = { title: "Glossary" };
export const dynamic = "force-dynamic";

/**
 * M10.1 — the in-app glossary (FR-M10-16, PRD §6.5). Loads the active content bundle
 * server-side (cached loader) and renders the searchable, deep-linkable panel. Pure
 * reference content — no workspace data, no money, no writes.
 */
export default async function GlossaryPage() {
  const bundle = await getActiveContentBundle();
  // Alphabetical by term so the panel reads as a dictionary.
  const entries = [...bundle.glossary].sort((a, b) => a.term.localeCompare(b.term));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Glossary</h1>
          {/* The legend "?" belongs on every table/form header (rule 14); the glossary
              is the help hub, so the input-vs-computed explainer lives here too. */}
          <LegendExplainer />
        </div>
        <p className="text-sm text-muted-foreground">
          The terms behind every figure — GCI, VAT, EWT and the rest. Contextual help
          throughout the app links here.
        </p>
      </header>

      <GlossaryPanel entries={entries} />
    </div>
  );
}
