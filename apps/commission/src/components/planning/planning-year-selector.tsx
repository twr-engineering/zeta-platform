"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/affordance/select-field";
import { ROUTES } from "@/lib/routes";

/**
 * M3.3 — the plan-year selector (rule 11, FR-M3-04). The workbook's `PlanYear` cell (D4):
 * one blue input choosing which year's plan to view. Per-user view state in the URL
 * (`?year=`), default the current calendar year (a clean URL). Options are every year
 * with a target row, plus the current year, plus the selected one — so a year with no
 * row is still selectable and offers to create it (the empty state).
 */
export function PlanningYearSelector({
  selected,
  currentYear,
  years,
}: {
  selected: number;
  currentYear: number;
  years: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const yearSet = new Set<number>(years);
  yearSet.add(currentYear);
  yearSet.add(selected);
  const options = [...yearSet]
    .sort((a, b) => b - a)
    .map((y) => ({ value: String(y), label: String(y) }));

  const onChange = (next: string) => {
    startTransition(() => {
      router.push(
        next === String(currentYear) ? ROUTES.calculator : `${ROUTES.calculator}?year=${next}`
      );
    });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="plan-year" className="text-sm font-medium">
        Plan year
      </label>
      <SelectField
        id="plan-year"
        affordance="input"
        className="w-28"
        value={String(selected)}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        disabled={pending}
        data-testid="plan-year-filter"
        aria-busy={pending}
      />
    </div>
  );
}
