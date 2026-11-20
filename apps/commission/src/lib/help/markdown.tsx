/**
 * M10.1 — a minimal markdown renderer for help copy, with glossary auto-linking.
 *
 * The doctrine bodies are short markdown: paragraphs, `**bold**`, `*italic*`, and
 * (in the legend article) `- ` bullet lists. A full markdown library would be dead
 * weight and a supply-chain surface for four features; this handles exactly what the
 * seeded content uses and nothing more. Glossary terms found in the text link to
 * /glossary#<key> at render time (the stored bytes are untouched — rule 12).
 */
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";
import { buildGlossaryIndex, linkifyRun, type GlossaryAlias } from "./glossary-link";
import type { GlossaryEntry } from "./types";

export type MarkdownProps = {
  body: string;
  /** Glossary used for auto-linking; omit or set linkGlossary=false to disable. */
  glossary?: GlossaryEntry[];
  /** Auto-link glossary terms in the body (default true when glossary is given). */
  linkGlossary?: boolean;
  className?: string;
};

/** Render a plain-text run: split into glossary links + text. */
function renderText(
  text: string,
  index: GlossaryAlias[],
  used: Set<string>,
  keyBase: string
): React.ReactNode[] {
  if (index.length === 0) return [text];
  return linkifyRun(text, index, used).map((seg, i) => {
    if (seg.kind === "link") {
      return (
        <Link
          key={`${keyBase}-l${i}`}
          href={`/glossary#${seg.key}`}
          className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          data-testid={`glossary-link-${seg.key}`}
        >
          {seg.value}
        </Link>
      );
    }
    return <React.Fragment key={`${keyBase}-t${i}`}>{seg.value}</React.Fragment>;
  });
}

/** Render inline markup (**bold** / *italic*) then linkify the plain runs within. */
function renderInline(
  text: string,
  index: GlossaryAlias[],
  used: Set<string>,
  keyBase: string
): React.ReactNode[] {
  const parts = text.split(/(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    const k = `${keyBase}-${i}`;
    if (/^\*\*[\s\S]+\*\*$/.test(part)) {
      return <strong key={k}>{renderText(part.slice(2, -2), index, used, k)}</strong>;
    }
    if (/^\*[\s\S]+\*$/.test(part)) {
      return <em key={k}>{renderText(part.slice(1, -1), index, used, k)}</em>;
    }
    return <React.Fragment key={k}>{renderText(part, index, used, k)}</React.Fragment>;
  });
}

export function Markdown({
  body,
  glossary,
  linkGlossary = true,
  className,
}: MarkdownProps) {
  // Cheap enough to build per render — keeps this a plain function so it works in
  // both server components (the glossary page) and client ones (the popover).
  const index = linkGlossary && glossary ? buildGlossaryIndex(glossary) : [];
  // One `used` set per render so each term links at most once per article.
  const used = new Set<string>();

  const blocks = body.split(/\n{2,}/).filter((b) => b.trim() !== "");

  return (
    <div className={cn("space-y-2.5 text-sm leading-relaxed", className)}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => l.trim().startsWith("- "));
        if (isList) {
          return (
            <ul key={`b${bi}`} className="list-disc space-y-1.5 pl-5">
              {lines.map((line, li) => (
                <li key={`b${bi}-${li}`}>
                  {renderInline(line.trim().slice(2), index, used, `b${bi}-${li}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`b${bi}`}>{renderInline(block.replace(/\n/g, " "), index, used, `b${bi}`)}</p>
        );
      })}
    </div>
  );
}
