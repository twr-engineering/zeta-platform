"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/affordance/select-field";
import { ROUTES } from "@/lib/routes";

/**
 * M7.2 — the Source Performance year filter (PRD §6, FR-M7-02). The sole input on the
 * screen (the report is otherwise read-only), so it wears the blue `affordance="input"`.
 * Per-user view state in the URL (`?year=`); changing it re-requests the page so the
 * SERVER re-aggregates — no client-side re-aggregation (FR-M7-02).
 *
 * Unlike the Yield Summary filter, the DEFAULT is `All` (PRD §6 "Year: [All ▾]"), not
 * the current year — the scorecard reads all-time first. Options are `All` + exactly the
 * distinct booked years present (FR-M7-02: never a year with no booked deal); a
 * deep-linked selected year is added so it stays selectable even after the last of its
 * deals moves.
 */
export function SourceYearFilter({
  selected,
  years,
}: {
  /** The resolved filter: "all" or a year string. */
  selected: string;
  years: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const yearSet = new Set<number>(years);
  if (selected !== "all" && /^\d{4}$/.test(selected)) yearSet.add(Number(selected));
  const options = [
    { value: "all", label: "All years" },
    ...[...yearSet].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) })),
  ];

  const onChange = (next: string) => {
    startTransition(() => {
      // "All" is the default → clean URL; any year carries ?year=.
      router.push(next === "all" ? ROUTES.sourcePerformance : `${ROUTES.sourcePerformance}?year=${next}`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="source-year" className="text-sm font-medium">
        Year
      </label>
      <SelectField
        id="source-year"
        affordance="input"
        className="w-32"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        disabled={pending}
        data-testid="source-year-filter"
        aria-busy={pending}
      />
    </div>
  );
}
