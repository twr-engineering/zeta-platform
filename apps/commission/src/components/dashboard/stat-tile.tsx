import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A single dashboard tile (M6 §6 — Sections 1–3 are tile groups). The value is a
 * pre-formatted display string the server builder produced (₱ strings, percentages)
 * — the tile NEVER computes money (Master PRD cross-cutting rule; M6.2 brief). When
 * `href` is set the whole tile is a drill-down link to the list that explains it
 * (FR-M6-12), with a corner affordance on hover/focus.
 *
 * `tone` colours the value: `positive` green, `negative` red (written-off, a
 * behind-pace or negative variance), `muted` grey (a suppressed "—").
 */
export type StatTileTone = "default" | "positive" | "negative" | "muted";

export type StatTileProps = {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone?: StatTileTone;
  href?: string;
  /** A short description of where the drill-down leads (link title / a11y). */
  hrefTitle?: string;
  testId?: string;
  className?: string;
};

const TONE_CLASS: Record<StatTileTone, string> = {
  default: "text-foreground",
  positive: "text-emerald-700 dark:text-emerald-300",
  negative: "text-destructive",
  muted: "text-muted-foreground",
};

export function StatTile({
  label,
  value,
  caption,
  tone = "default",
  href,
  hrefTitle,
  testId,
  className,
}: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {href && (
          <ArrowUpRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover/tile:text-foreground group-focus-visible/tile:text-foreground"
          />
        )}
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums text-pretty tracking-tight",
          TONE_CLASS[tone]
        )}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
      </p>
      {caption && (
        <p className="mt-1 text-xs text-pretty text-muted-foreground">{caption}</p>
      )}
    </>
  );

  const shared = "flex flex-col rounded-xl border p-4 ring-1 ring-foreground/5";

  if (href) {
    return (
      <Link
        href={href}
        title={hrefTitle}
        data-testid={testId}
        className={cn(
          shared,
          "group/tile transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div data-testid={testId} className={cn(shared, className)}>
      {body}
    </div>
  );
}
