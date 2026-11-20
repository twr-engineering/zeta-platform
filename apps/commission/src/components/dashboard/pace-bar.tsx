import { cn } from "@/lib/utils";

/**
 * The Section 2 pace bar (M6 §6 — "the pace bar is the only chart; no chart
 * library"). A pure proportional `<div>` track: the fill is how far collections
 * have come against the annual target (pctOfTarget), and the marker is where the
 * day-accurate pace says you should be (paceFraction). Fill short of the marker =
 * behind (red); at or past it = ahead (green). Both fractions are the server's
 * decimal strings; `Number()` here is display-only width math, never money.
 *
 * When the target is unknown (rule 9) the bar renders an inert "—" track.
 */
export function PaceBar({
  pctOfTarget,
  paceFraction,
  paceLabel,
}: {
  pctOfTarget: string | null;
  paceFraction: string;
  paceLabel: "ahead" | "behind" | null;
}) {
  if (pctOfTarget === null || paceLabel === null) {
    return (
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-muted"
        data-testid="pace-bar-empty"
        aria-hidden="true"
      />
    );
  }

  const fill = clampPct(pctOfTarget);
  const marker = clampPct(paceFraction);
  const ahead = paceLabel === "ahead";

  return (
    <div
      className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
      data-testid="pace-bar"
      data-pace={paceLabel}
      role="img"
      aria-label={`Collections at ${fill.toFixed(1)}% of target; pace line at ${marker.toFixed(1)}%.`}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          ahead ? "bg-emerald-500 dark:bg-emerald-400" : "bg-destructive"
        )}
        style={{ width: `${fill}%` }}
        data-testid="pace-bar-fill"
      />
      {/* pace marker — where the year's elapsed days say you should be */}
      <div
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/70"
        style={{ left: `${marker}%` }}
        data-testid="pace-bar-marker"
        title="Pace to date"
      />
    </div>
  );
}

/** A 0–100 percentage from a 0–1 rate string, clamped for the track width. */
function clampPct(rate: string): number {
  const n = Number(rate) * 100;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
