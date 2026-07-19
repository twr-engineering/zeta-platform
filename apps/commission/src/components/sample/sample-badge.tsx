import { cn } from "@/lib/utils";

/**
 * M10.3 — the "SAMPLE" badge (rule 4, §6.6: amber). Rendered on every table row,
 * detail header and figure that comes from sample data, so the walkthrough's
 * numbers are never mistaken for real ones. Presentational only.
 */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="sample-badge"
      className={cn(
        "inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      Sample
    </span>
  );
}
