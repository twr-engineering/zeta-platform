"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/affordance/select-field";
import { reportPath, type ReportTabSlug } from "@/lib/reports/tabs";

/**
 * M8.3 — the shared selected-year control for reports 3 & 4 (FR-M8-05, rule 3). The
 * ONE blue input on these tabs (the report is otherwise read-only "black cells");
 * changing it re-requests the SAME tab with `?year=` so the server re-aggregates —
 * no client-side money math. Default is the current Manila year (resolved server-
 * side); options are the rule-2 union range, plus the deep-linked year if it isn't
 * in the list, so a shared URL stays selectable.
 */
export function ReportYearSelector({
  slug,
  selected,
  years,
}: {
  slug: ReportTabSlug;
  /** The resolved selected year as a string. */
  selected: string;
  /** The selectable range (getReportYears), ascending. */
  years: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const yearSet = new Set<number>(years);
  if (/^\d{4}$/.test(selected)) yearSet.add(Number(selected));
  const options = [...yearSet]
    .sort((a, b) => b - a)
    .map((y) => ({ value: String(y), label: String(y) }));

  const onChange = (next: string) => {
    startTransition(() => {
      router.push(reportPath(slug, { year: next }));
    });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="report-year" className="text-sm font-medium">
        Year
      </label>
      <SelectField
        id="report-year"
        affordance="input"
        className="w-28"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        disabled={pending}
        data-testid="report-year-selector"
        aria-busy={pending}
      />
    </div>
  );
}
