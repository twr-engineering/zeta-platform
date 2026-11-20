"use client";

import { TriangleAlert } from "lucide-react";

import type { DealWarning } from "@/lib/deals/deal-warnings";

/**
 * The soft-warning banners (FR-M1-11, §6): amber, inline, never blocking. Each
 * names the risk in plain language; the form's submit becomes "Save anyway" when
 * any are showing, and a save made past them is audit-logged server-side (the
 * "Continue anyway (audit-logged)" contract). These are advisory — the agent is
 * always free to proceed.
 */

const WARNING_TITLES: Record<DealWarning["key"], string> = {
  duplicate: "Possible duplicate",
  split_at_source: "Split at source?",
  representation_mismatch: "Representation looks off",
};

export function WarningBanners({ warnings }: { warnings: readonly DealWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="deal-warnings" role="status">
      {warnings.map((warning) => (
        <div
          key={warning.key}
          data-testid={`deal-warning-${warning.key}`}
          className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{WARNING_TITLES[warning.key]}</p>
            <p className="text-pretty">{warning.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
