"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SearchDealOption } from "@/lib/search/filter-options";

/**
 * M9 — the Deal ID filter (FR-M9-03): a type-ahead over `display_label` that
 * applies an exact `deal_code` match. Clearable; the API tolerates a code that
 * matches nothing (it just yields the empty state, Rule 9). The filter is pure and
 * synchronous over the preloaded index — no network per keystroke — so it clears
 * the type-ahead bar with room to spare, mirroring the payments deal-picker.
 *
 * Fully controlled: the selected `value` (a deal code, or null) lives in the URL.
 * A pick calls `onSelect(code)`; Clear calls `onSelect(null)`.
 */

export type DealCodeComboboxProps = {
  options: readonly SearchDealOption[];
  /** The selected deal code, or null. Owned by the URL / parent. */
  value: string | null;
  onSelect: (code: string | null) => void;
  /** Suffixes ids so two instances (desktop bar + mobile sheet) don't collide. */
  instanceId: string;
  /** Only the primary (desktop) instance carries the canonical test id. */
  withTestId?: boolean;
};

function haystack(o: SearchDealOption): string {
  return `${o.dealCode} ${o.displayLabel}`.toLowerCase();
}

export function DealCodeCombobox({
  options,
  value,
  onSelect,
  instanceId,
  withTestId,
}: DealCodeComboboxProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = `${instanceId}-list`;
  const tid = (name: string) => (withTestId ? name : undefined);

  const selected = React.useMemo(
    () => options.find((o) => o.dealCode === value) ?? null,
    [options, value]
  );

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/) : [];
    const matched = q
      ? options.filter((o) => {
          const hay = haystack(o);
          return tokens.every((t) => hay.includes(t));
        })
      : options;
    return matched.slice(0, 50);
  }, [options, query]);

  React.useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(option: SearchDealOption) {
    onSelect(option.dealCode);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // A chosen code collapses into a confirmation chip with a Clear button.
  if (selected) {
    return (
      <div ref={rootRef}>
        <div
          data-testid={tid("search-deal-selected")}
          className="flex h-9 items-center justify-between gap-2 rounded-md border bg-background px-2.5"
        >
          <span className="truncate text-sm font-medium" title={selected.displayLabel}>
            {selected.dealCode}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-1.5 h-6 px-1.5"
            onClick={() => onSelect(null)}
            data-testid={tid("search-deal-clear")}
            aria-label="Clear deal filter"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <InputField
        role="combobox"
        affordance="plain"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Deal ID"
        aria-activedescendant={
          open && results[active] ? `${listId}-${results[active].id}` : undefined
        }
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Deal ID…"
        className="pl-8"
        autoComplete="off"
        data-testid={tid("search-deal")}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          data-testid={tid("search-deal-options")}
          className="absolute z-30 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No deal matches “{query}”.
            </li>
          ) : (
            results.map((option, i) => (
              <li
                key={option.id}
                role="option"
                aria-selected={i === active}
                id={`${listId}-${option.id}`}
              >
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(i)}
                  data-testid={tid(`search-deal-option-${option.dealCode}`)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-left",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  )}
                >
                  <span className="min-w-0 truncate text-sm">{option.displayLabel}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {option.dealCode}
                  </Badge>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
