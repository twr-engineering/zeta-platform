import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The empty state every list and dashboard must render when its query comes
 * back with no rows (CLAUDE.md: no mock data, ever — real queries plus this).
 *
 * `description` should explain what the list drives, not just that it is empty:
 * M0 §6 wants "Lead Sources feed the Source dropdown on every deal and the
 * Source Performance report", not "No lead sources".
 */
export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Stable marker for the M10.4 empty-state registry coverage check (§6.4). */
  testId?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  testId,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground [&_svg]:size-8" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-balance">{title}</h3>
      {description && (
        <p className="mt-2 max-w-prose text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
