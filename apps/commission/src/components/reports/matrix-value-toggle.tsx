"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";
import { reportPath } from "@/lib/reports/tabs";
import type { MatrixValue } from "@/lib/reports";

/**
 * M8.3 — the vintage matrix value toggle (FR-M8-04). A segmented control marking
 * the matrix's one interactive choice: Net of VAT (default) or Net Cash. The active
 * value is URL state (`?value=`), so it re-requests the server aggregate (no client
 * math) and a shared link reproduces the exact view; Net of VAT is the default and
 * links clean. Wears the blue affordance tint on the active segment — the M0
 * "input" convention for the one editable control on an otherwise read-only screen.
 */
const OPTIONS: readonly { value: MatrixValue; label: string }[] = [
  { value: "net_of_vat", label: "Net of VAT" },
  { value: "net_cash", label: "Net Cash" },
];

export function MatrixValueToggle({ value }: { value: MatrixValue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (next: MatrixValue) => {
    if (next === value) return;
    startTransition(() => {
      router.push(reportPath("vintage-matrix", { value: next }));
    });
  };

  return (
    <div
      role="group"
      aria-label="Matrix value"
      data-affordance="input"
      className="inline-flex rounded-md border border-affordance-input-border bg-affordance-input p-0.5"
      data-testid="matrix-value-toggle"
      aria-busy={pending}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => select(opt.value)}
            aria-pressed={active}
            disabled={pending}
            data-testid={`matrix-value-${opt.value}`}
            data-active={active ? "true" : undefined}
            className={cn(
              "rounded-[5px] px-3 py-1 text-sm font-medium transition-colors disabled:opacity-60",
              active
                ? "bg-background text-foreground shadow-xs"
                : "text-affordance-input-foreground/80 hover:text-affordance-input-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
