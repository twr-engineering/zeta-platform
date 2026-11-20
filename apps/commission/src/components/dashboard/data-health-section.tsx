import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { collectiblesPath, dealsPath, paymentsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { DataHealthSection as DataHealthData } from "@/lib/dashboard/queries";

import { DashboardSection } from "./section";

/**
 * Section 7 — DATA HEALTH (M6 §3.3, FR-M6-08). Bookkeeping-hygiene checks: each is a
 * row that reads ✓ "nothing to fix" when its count is 0, else ⚠ with the count and a
 * drill-down to exactly the records it flagged (the user fixes them there — a check
 * never mutates, §4 rule 18). Checks (b) fully-paid-open, (c) closed variance beyond
 * ₱0.50 (decimal tolerance, never float equality), (d) referral fees owed out, plus
 * M5's stale-basis count.
 *
 * DROPPED (documented so a tester does not report them missing): (a) "no status set"
 * is structurally impossible (status defaults Open); (e)/(f) "Property Type /
 * Developer missing from Settings" are replaced by M0 referential integrity (rule
 * 17) — a referenced list item can only be archived, never deleted.
 */

type CheckRow = {
  id: string;
  title: string;
  /** The one-line fix instruction (reuses the sheet's phrasing). */
  instruction: string;
  count: number;
  href: string;
  /** Singular/plural noun for the "View N record(s)" link. */
  noun: string;
};

export function DataHealthSection({ data }: { data: DataHealthData }) {
  const checks: CheckRow[] = [
    {
      id: "b",
      title: "Fully paid but still Open",
      instruction: "Open receivables with a zero or negative balance — mark them Closed.",
      count: data.fullyPaidNotClosed.count,
      href: collectiblesPath({ status: "open", overpaid: true }),
      noun: "receivable",
    },
    {
      id: "c",
      title: "Closed short or over by more than ₱0.50",
      instruction:
        "Closed receivables whose collected total drifted from the collectible — review the payments or confirm the collectible.",
      count: data.closedVarianceOverTolerance.count,
      href: collectiblesPath({ status: "closed", varianceOverTolerance: true }),
      noun: "receivable",
    },
    {
      id: "d",
      title: "Referral fees not yet paid out",
      instruction: "Deals with a referral fee owed — settle it, then mark Referral Paid.",
      count: data.referralFeesOwed.count,
      href: dealsPath({ referralUnpaid: true }),
      noun: "deal",
    },
    {
      id: "stale",
      title: "Payments on a changed tax basis",
      instruction:
        "Releases whose stored VAT/EWT split no longer matches the deal and current rates — review and optionally recompute.",
      count: data.staleBasisPayments.count,
      href: paymentsPath({ stale: true }),
      noun: "payment",
    },
  ];

  return (
    <DashboardSection
      index={7}
      title="Data Health"
      description="Bookkeeping hygiene. The year filter does not touch this."
      testId="section-data-health"
    >
      {data.allClear && (
        <p
          className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          data-testid="data-health-all-clear"
        >
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          Nothing to fix — every check passed.
        </p>
      )}

      <ul className="divide-y rounded-xl border ring-1 ring-foreground/5" data-testid="data-health-list">
        {checks.map((check) => (
          <DataHealthRow key={check.id} check={check} />
        ))}
      </ul>
    </DashboardSection>
  );
}

function DataHealthRow({ check }: { check: CheckRow }) {
  const ok = check.count === 0;
  return (
    <li
      className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
      data-testid={`health-check-${check.id}`}
      data-count={check.count}
      data-ok={ok ? "true" : "false"}
    >
      <div className="flex items-start gap-2.5">
        {ok ? (
          <CircleCheck
            className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        )}
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{check.title}</p>
          <p className="text-xs text-pretty text-muted-foreground">{check.instruction}</p>
        </div>
      </div>
      <div className="shrink-0 pl-6 sm:pl-0 sm:text-right">
        {ok ? (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            nothing to fix
          </span>
        ) : (
          <span className="flex items-center gap-2 sm:justify-end">
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 tabular-nums",
                "dark:bg-amber-950/60 dark:text-amber-200"
              )}
              data-testid={`health-count-${check.id}`}
            >
              {check.count}
            </span>
            <Link
              href={check.href}
              className="text-xs font-medium text-primary hover:underline"
              data-testid={`health-link-${check.id}`}
            >
              View {check.count} {check.noun}
              {check.count === 1 ? "" : "s"}
            </Link>
          </span>
        )}
      </div>
    </li>
  );
}
