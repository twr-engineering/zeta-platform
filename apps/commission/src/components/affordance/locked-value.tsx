"use client";

import * as React from "react";
import { Lock, Link2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The "locked computed value" half of the input-vs-computed contract
 * (Master PRD §4.4, M0 §6): computed fields are never directly editable, render
 * read-only with a lock icon, and name their formula on hover.
 *
 * The `formula` slot is not decoration — M10 specs the tooltip as the place the
 * agent learns why a number is what it is, replacing the sheet's habit of
 * clicking a cell to read the formula bar.
 */

const lockedValueVariants = cva(
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm tabular-nums select-text",
  {
    variants: {
      variant: {
        /** Computed by the engine — the workbook's black formula cells. */
        locked:
          "border-transparent bg-affordance-locked text-affordance-locked-foreground",
        /** Sourced from another module — the workbook's green linked cells. */
        linked:
          "border-transparent bg-affordance-linked text-affordance-linked-foreground",
      },
      align: {
        start: "justify-start",
        end: "justify-end",
      },
      size: {
        default: "h-8",
        lg: "h-9 text-base font-medium",
      },
    },
    defaultVariants: {
      variant: "locked",
      align: "start",
      size: "default",
    },
  }
);

export type LockedValueProps = Omit<React.ComponentProps<"output">, "children"> &
  VariantProps<typeof lockedValueVariants> & {
    /** Pre-formatted display text — format with `@/lib/money` before passing. */
    children: React.ReactNode;
    /**
     * Plain-language formula shown on hover/focus, e.g.
     * "Net List Price = List Price ÷ (1 + VAT rate)".
     * Omit only where the surrounding label already states it.
     */
    formula?: React.ReactNode;
    /** Hide the lock/link glyph where a column already communicates lockedness. */
    hideIcon?: boolean;
  };

function LockedValue({
  className,
  children,
  formula,
  variant,
  align,
  size,
  hideIcon = false,
  ...props
}: LockedValueProps) {
  const Icon = variant === "linked" ? Link2 : Lock;

  const value = (
    <output
      data-slot="locked-value"
      data-affordance={variant ?? "locked"}
      className={cn(lockedValueVariants({ variant, align, size }), className)}
      {...props}
    >
      {!hideIcon && (
        <Icon
          aria-hidden="true"
          className="size-3 shrink-0 opacity-50"
          strokeWidth={2.5}
        />
      )}
      <span className="truncate">{children}</span>
    </output>
  );

  if (!formula) return value;

  return (
    <Tooltip>
      {/* `render` forwards the trigger's behaviour onto the value itself rather
          than wrapping it in a button — a computed value must not be clickable. */}
      <TooltipTrigger
        render={value}
        // Keyboard users must reach the formula too; an <output> is not focusable.
        tabIndex={0}
        className="cursor-help"
      />
      <TooltipContent>{formula}</TooltipContent>
    </Tooltip>
  );
}

export { LockedValue, lockedValueVariants };
