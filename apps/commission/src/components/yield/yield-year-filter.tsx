"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/affordance/select-field";
import { ROUTES } from "@/lib/routes";

/**
 * M2.4 — the Yield Summary year filter (PRD §6, FR-M2-05). This is the SOLE blue
 * input on the page — mirroring the sheet's one blue cell (C4) — so it wears the
 * `affordance="input"` blue, unlike the dashboard's grey filter. Per-user view state
 * in the URL (`?year=`); changing it re-requests the page so the SERVER restates the
 * segment table, memos and averages. The Planning Basis card does NOT move (Rule 4 —
 * it is always all-time, enforced structurally in getYieldSummaryView).
 *
 * `selected` is the resolved value ("all" or a year string); default is the current
 * booked year. Options: "All" + every booked year present in the data, plus the
 * current/selected year so a deep-linked or empty year stays selectable.
 */
export function YieldYearFilter({
  selected,
  currentYear,
  years,
}: {
  selected: string;
  currentYear: number;
  years: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const yearSet = new Set<number>(years);
  yearSet.add(currentYear);
  if (selected !== "all" && /^\d{4}$/.test(selected)) yearSet.add(Number(selected));
  const options = [
    { value: "all", label: "All years" },
    ...[...yearSet].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) })),
  ];

  const onChange = (next: string) => {
    startTransition(() => {
      // Current year is the default → clean URL; "All" and any other year carry ?year=.
      router.push(
        next === String(currentYear)
          ? ROUTES.yieldSummary
          : `${ROUTES.yieldSummary}?year=${next}`
      );
    });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="yield-year" className="text-sm font-medium">
        Report year
      </label>
      <SelectField
        id="yield-year"
        affordance="input"
        className="w-32"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        disabled={pending}
        data-testid="yield-year-filter"
        aria-busy={pending}
      />
    </div>
  );
}
