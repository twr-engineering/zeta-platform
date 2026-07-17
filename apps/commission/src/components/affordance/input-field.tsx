import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The "blue input" half of the product-wide input-vs-computed contract
 * (Master PRD §4.4, M0 §6). Blue means: the agent types here.
 *
 * Pair with `<LockedValue>` for anything the engine computes. A field should
 * never be a plain `<Input>` on a money surface — that reads as neither.
 */

const inputFieldVariants = cva("", {
  variants: {
    affordance: {
      /** Editable by the agent — the workbook's blue cells. */
      input:
        "border-affordance-input-border bg-affordance-input text-affordance-input-foreground " +
        "placeholder:text-affordance-input-foreground/50 " +
        "focus-visible:border-affordance-input-ring focus-visible:ring-affordance-input-ring/40 " +
        "dark:bg-affordance-input",
      /** Plain input, for non-money surfaces (search, auth forms). */
      plain: "",
    },
    align: {
      start: "text-start",
      /** Money and rates read right-aligned so decimal points line up. */
      end: "text-end tabular-nums",
    },
  },
  defaultVariants: {
    affordance: "input",
    align: "start",
  },
});

export type InputFieldProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputFieldVariants>;

function InputField({
  className,
  affordance,
  align,
  ...props
}: InputFieldProps) {
  return (
    <Input
      data-affordance={affordance ?? "input"}
      className={cn(inputFieldVariants({ affordance, align }), className)}
      {...props}
    />
  );
}

export { InputField, inputFieldVariants };
