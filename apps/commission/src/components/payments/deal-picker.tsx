"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";
import { filterPaymentDeals, type PaymentDealOption } from "@/lib/payments/picker";
import type { ReceivableStatus } from "@/types/entities";

/**
 * The searchable deal picker (FR-M5-02, §6.1) — the first field of the fast-entry
 * form and where focus opens. Type part of a deal code or client name ("sal",
 * "21", "daria" all find D021) and the matching deals surface, each showing the
 * developer and the receivable's status + open balance so the agent confirms they
 * grabbed the right deal without leaving the form. Replaces the sheet's dropdown +
 * helper column + cleanup Apps Script.
 *
 * The filter is pure and synchronous over a preloaded index (picker.ts) — no
 * network per keystroke — so it clears the < 150 ms type-ahead bar (§8) with room
 * to spare on the 1,000-deal target. The picker stores the deal id (the FK), never
 * the label.
 */

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** The "Open · bal ₱354,591.84" hint (§6.1). */
function statusHint(option: PaymentDealOption): React.ReactNode {
  if (!option.receivable_status) return null;
  const warn = option.receivable_status !== "open";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        warn ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
      )}
    >
      {STATUS_LABEL[option.receivable_status]}
      {option.balance !== null && ` · bal ${formatPHP(option.balance)}`}
    </span>
  );
}

export type DealPickerProps = {
  options: readonly PaymentDealOption[];
  /** The selected deal id, or "" when none. Owned by the form. */
  value: string;
  onSelect: (dealId: string) => void;
  autoFocus?: boolean;
};

export function DealPicker({ options, value, onSelect, autoFocus }: DealPickerProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const selected = React.useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value]
  );

  const results = React.useMemo(
    () => filterPaymentDeals(options, query).slice(0, 50),
    [options, query]
  );

  // Clamp the active row whenever the result set changes under it.
  React.useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Close on an outside click (a tap elsewhere on the form dismisses the list).
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

  function choose(option: PaymentDealOption) {
    onSelect(option.id);
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

  // A chosen deal collapses the search into a confirmation chip with a Change
  // button — one less thing on screen for the next field, and unmistakable that a
  // deal is locked in. The FK rides in a hidden input the form submits.
  if (selected) {
    return (
      <div ref={rootRef}>
        <input type="hidden" name="dealId" value={selected.id} />
        <div
          data-testid="payment-deal-selected"
          className="flex items-center justify-between gap-3 rounded-md border border-affordance-input-border bg-affordance-input px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-affordance-input-foreground">
              {selected.display_label}
            </p>
            <p className="truncate text-xs">
              {selected.developer_name && (
                <span className="text-muted-foreground">
                  {selected.developer_name}
                  {selected.receivable_status && " · "}
                </span>
              )}
              {statusHint(selected)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect("");
              setQuery("");
              setOpen(true);
            }}
            data-testid="payment-deal-clear"
            aria-label="Change deal"
          >
            <X className="size-4" /> Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name="dealId" value="" />
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <InputField
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
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
          placeholder="Search a deal by code or client…"
          className="pl-8"
          autoFocus={autoFocus}
          autoComplete="off"
          data-testid="payment-deal-search"
        />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          data-testid="payment-deal-options"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li
              className="px-3 py-2 text-sm text-muted-foreground"
              data-testid="payment-deal-empty"
            >
              No active deal matches “{query}”.
            </li>
          ) : (
            results.map((option, i) => (
              <li key={option.id} role="option" aria-selected={i === active} id={`${listId}-${option.id}`}>
                <button
                  type="button"
                  // onMouseDown, not onClick: mousedown fires before the input's
                  // blur, so the selection lands instead of the list closing first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(i)}
                  data-testid={`payment-deal-option-${option.deal_code}`}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-sm px-2.5 py-2 text-left",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {option.display_label}
                    </span>
                    <span className="block truncate text-xs">
                      {option.developer_name && (
                        <span className="text-muted-foreground">
                          {option.developer_name}
                          {option.receivable_status && " · "}
                        </span>
                      )}
                      {statusHint(option)}
                    </span>
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {option.deal_code}
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
