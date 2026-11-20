"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/affordance/select-field";
import { ROUTES } from "@/lib/routes";

/**
 * The dashboard year filter (M6 §6, FR-M6-11) — the sticky header control. It is
 * per-user view state carried in the URL (`?year=`); changing it re-requests the
 * page so the SERVER restates Sections 2 and 6 ONLY (the scope rule is enforced
 * structurally in getDashboardData — sections 1/3/4/5/7/8 never see the year). The
 * mandatory scope caption is the single most-misread rule made explicit (rule 1).
 */
export function DashboardYearFilter({
  selectedYear,
  currentYear,
}: {
  selectedYear: number;
  currentYear: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // A window around "now": next year down through six past years, plus the
  // selected year if it falls outside that window (a deep-linked past year).
  const years = new Set<number>();
  for (let y = currentYear + 1; y >= currentYear - 6; y--) years.add(y);
  years.add(selectedYear);
  const options = [...years]
    .sort((a, b) => b - a)
    .map((y) => ({ value: String(y), label: String(y) }));

  // The select is driven by the URL-resolved `selectedYear` (a server prop), so
  // browser back/forward and deep links always show the true year.
  const onChange = (next: string) => {
    startTransition(() => {
      router.push(
        Number(next) === currentYear ? ROUTES.dashboard : `${ROUTES.dashboard}?year=${next}`
      );
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor="dashboard-year" className="text-sm font-medium">
          Year
        </label>
        <SelectField
          id="dashboard-year"
          affordance="plain"
          className="w-28"
          value={String(selectedYear)}
          onChange={(e) => onChange(e.target.value)}
          options={options}
          disabled={pending}
          data-testid="dashboard-year-filter"
          aria-busy={pending}
        />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="year-scope-caption">
        Filters &ldquo;Collected vs Target&rdquo; and &ldquo;Monthly Cash-In&rdquo; only
      </p>
    </div>
  );
}
