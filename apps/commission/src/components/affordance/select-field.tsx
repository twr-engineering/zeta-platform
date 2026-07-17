import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The "blue input" affordance on a `<select>` (Master PRD §4.4, M0 §6) — the
 * sibling of `<InputField>` for a fixed set of choices. The agent chooses here,
 * so it wears the same blue as every other editable cell.
 *
 * A native `<select>`, deliberately: this project's UI kit has no Base UI Select
 * yet, and a native control is keyboard- and touch-correct for free — which the
 * deal form needs at 360 px (M1 PRD §6). The settings lists use the same pattern
 * (list-screen.tsx `AttributeSelect`); this is that pattern made reusable.
 */

export type SelectFieldOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectFieldProps = Omit<React.ComponentProps<"select">, "children"> & {
  options: readonly SelectFieldOption[];
  /** A leading, empty, disabled option — "Choose a property type…". */
  placeholder?: string;
  /** "input" (blue, the agent enters data — default) or "plain" (a filter). */
  affordance?: "input" | "plain";
};

function SelectField({
  className,
  options,
  placeholder,
  affordance = "input",
  ...props
}: SelectFieldProps) {
  return (
    <select
      data-affordance={affordance}
      className={cn(
        "h-9 w-full rounded-md border px-3 text-sm shadow-xs",
        "focus-visible:outline-none focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        affordance === "input"
          ? "border-affordance-input-border bg-affordance-input text-affordance-input-foreground focus-visible:border-affordance-input-ring focus-visible:ring-affordance-input-ring/40"
          : "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40",
        className
      )}
      {...props}
    >
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export { SelectField };
