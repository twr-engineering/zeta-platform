"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { SelectField } from "@/components/affordance/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { SearchDealOption } from "@/lib/search/filter-options";
import {
  sortOptionsFor,
  type SearchSource,
  type SearchStatus,
  type SortOption,
} from "@/lib/search/types";
import { DealCodeCombobox } from "./deal-code-combobox";

/**
 * M9 — the per-source filter bar (§6). Fully controlled: every value comes from the
 * URL via the parent and every change flows back out through a handler that rewrites
 * the URL, so the bar holds no filter state of its own (the text box's keystroke
 * buffer lives in the parent for debouncing). The applicability matrix is visible,
 * not implicit (Rule 6): the Year label flips "booked"/"paid" per source (the Rule-3
 * asymmetry made legible), and Status + Only-with-balance render on Collectibles ONLY.
 */

const STATUS_CHIPS: { value: SearchStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export type SearchFilterBarProps = {
  source: SearchSource;
  year: number | null;
  dealCode: string | null;
  status: SearchStatus | null;
  onlyWithBalance: boolean;
  /** The live text buffer (parent-owned so it can debounce the URL write). */
  text: string;
  sort: SortOption;
  years: number[];
  dealOptions: readonly SearchDealOption[];

  onYear: (year: number | null) => void;
  onDealCode: (code: string | null) => void;
  onStatus: (status: SearchStatus | null) => void;
  onOnlyWithBalance: (value: boolean) => void;
  onText: (text: string) => void;
  onSort: (sort: SortOption) => void;

  /** `/`-to-focus targets this (desktop instance only). */
  textRef?: React.Ref<HTMLInputElement>;
  /** Distinct instance (desktop bar vs mobile sheet) — keeps ids/testids unique. */
  instanceId: string;
  /** Only the desktop bar carries the canonical data-testids the e2e drives. */
  withTestIds?: boolean;
  /** Stacked (mobile sheet) vs inline flow (desktop). */
  stacked?: boolean;
};

export function SearchFilterBar({
  source,
  year,
  dealCode,
  status,
  onlyWithBalance,
  text,
  sort,
  years,
  dealOptions,
  onYear,
  onDealCode,
  onStatus,
  onOnlyWithBalance,
  onText,
  onSort,
  textRef,
  instanceId,
  withTestIds,
  stacked,
}: SearchFilterBarProps) {
  const tid = (name: string) => (withTestIds ? name : undefined);
  const isCollectibles = source === "collectibles";
  const yearLabel = source === "payments" ? "Year paid" : "Year booked";
  const field = stacked ? "space-y-1.5" : "space-y-1.5";

  return (
    <div
      className={cn(
        "gap-3",
        stacked ? "flex flex-col" : "flex flex-wrap items-end"
      )}
      data-testid={tid("search-filter-bar")}
    >
      {/* Text — the primary field. Grows to fill the row on desktop. */}
      <div className={cn(field, stacked ? "" : "min-w-[14rem] flex-1")}>
        <label className="text-sm font-medium" htmlFor={`${instanceId}-text`}>
          Contains
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <InputField
            id={`${instanceId}-text`}
            ref={textRef}
            affordance="plain"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder="Client or property contains…"
            className="pl-8"
            autoComplete="off"
            data-testid={tid("search-text")}
          />
        </div>
      </div>

      {/* Year — label flips booked/paid per source (Rule 3). */}
      <div className={field}>
        <label className="text-sm font-medium" htmlFor={`${instanceId}-year`}>
          {yearLabel}
        </label>
        <SelectField
          id={`${instanceId}-year`}
          affordance="plain"
          className={stacked ? "w-full" : "w-32"}
          value={year === null ? "all" : String(year)}
          onChange={(e) =>
            onYear(e.target.value === "all" ? null : Number(e.target.value))
          }
          options={[
            { value: "all", label: "All years" },
            ...years.map((y) => ({ value: String(y), label: String(y) })),
          ]}
          data-testid={tid("search-year")}
          data-year-label={yearLabel}
        />
      </div>

      {/* Deal ID — exact-match type-ahead. */}
      <div className={cn(field, stacked ? "" : "w-52")}>
        <label className="text-sm font-medium">Deal ID</label>
        <DealCodeCombobox
          options={dealOptions}
          value={dealCode}
          onSelect={onDealCode}
          instanceId={`${instanceId}-deal`}
          withTestId={withTestIds}
        />
      </div>

      {/* Sort — worded per source; the Collectibles quirk shows as two options. */}
      <div className={field}>
        <label className="text-sm font-medium" htmlFor={`${instanceId}-sort`}>
          Sort
        </label>
        <SelectField
          id={`${instanceId}-sort`}
          affordance="plain"
          className={stacked ? "w-full" : "w-44"}
          value={sort}
          onChange={(e) => onSort(e.target.value as SortOption)}
          options={sortOptionsFor(source)}
          data-testid={tid("search-sort")}
        />
      </div>

      {/* Status + Only-with-balance — Collectibles ONLY (Rule 6). */}
      {isCollectibles && (
        <div className={field}>
          <span className="text-sm font-medium">Status</span>
          <div className="flex h-9 flex-wrap items-center gap-1.5" data-testid={tid("search-status")}>
            {STATUS_CHIPS.map((chip) => {
              const activeChip = status === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => onStatus(activeChip ? null : chip.value)}
                  aria-pressed={activeChip}
                  data-testid={tid(`search-status-${chip.value}`)}
                  data-active={activeChip ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    activeChip
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isCollectibles && (
        <label
          className={cn(
            "flex items-center gap-2 text-sm",
            stacked ? "pt-1" : "self-end pb-2"
          )}
        >
          <Checkbox
            checked={onlyWithBalance}
            onCheckedChange={(v) => onOnlyWithBalance(v === true)}
            data-testid={tid("search-only-with-balance")}
          />
          Only with balance
        </label>
      )}
    </div>
  );
}
