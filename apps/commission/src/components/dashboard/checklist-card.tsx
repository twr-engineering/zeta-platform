"use client";

/**
 * M10.3 — the getting-started checklist card (FR-M10-15, §3.2). Four event-derived
 * items on the dashboard/home until dismissed. It NEVER gates anything (rule 9) —
 * every item is a shortcut, not a lock — and its completion is derived, never
 * clicked (rule 10: the sample deal never ticks first-deal). Dismiss hides it
 * everywhere; it is reversible from Settings.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Circle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { dismissChecklist } from "@/lib/onboarding/checklist-actions";
import type { ChecklistItem, ChecklistItemKey } from "@/lib/onboarding/checklist-derive";

const ITEM_ACTION: Record<ChecklistItemKey, { href: string; cta: string }> = {
  settings_reviewed: { href: ROUTES.settingsTax, cta: "Review" },
  first_deal: { href: ROUTES.dealNew, cta: "Log a deal" },
  first_payment: { href: ROUTES.paymentNew, cta: "Log a payment" },
  importer_run: { href: ROUTES.dealImport, cta: "Import" },
};

export function ChecklistCard({ items }: { items: ChecklistItem[] }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const doneCount = items.filter((i) => i.done).length;

  const dismiss = () => {
    setHidden(true); // optimistic — the card is non-gating, so this is safe
    startTransition(async () => {
      await dismissChecklist();
    });
  };

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-xs"
      data-testid="checklist-card"
      aria-label="Getting started"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-medium">Getting started</h2>
          <p className="text-sm text-muted-foreground">
            {doneCount} of {items.length} done — these tick themselves as you go.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          aria-label="Dismiss the getting-started checklist"
          className="text-muted-foreground hover:text-foreground"
          data-testid="checklist-dismiss"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <ul className="mt-3 space-y-2" data-testid="checklist-items">
        {items.map((item) => {
          const action = ITEM_ACTION[item.key];
          return (
            <li
              key={item.key}
              className="flex items-center gap-3"
              data-testid={`checklist-item-${item.key}`}
              data-done={item.done ? "true" : "false"}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  item.done ? "bg-emerald-500/15 text-emerald-600" : "text-muted-foreground",
                )}
              >
                {item.done ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Circle className="size-3.5" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", item.done && "text-muted-foreground line-through")}>
                  {item.label}
                </p>
                {!item.done && <p className="text-xs text-muted-foreground">{item.hint}</p>}
              </div>
              {!item.done && (
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={action.href} />}
                  data-testid={`checklist-cta-${item.key}`}
                >
                  {action.cta}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
