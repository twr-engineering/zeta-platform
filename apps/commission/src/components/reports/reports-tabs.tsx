"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { REPORT_TABS, reportPath, type ReportTab } from "@/lib/reports/tabs";

/**
 * M8.3 — the Reports tab bar (FR-M8-01 / §6). Five deep-linkable tabs in sheet
 * order; the active one is derived from the pathname so a page refresh or a shared
 * `/reports/tax-per-month?year=2026` link lands with the right tab lit. The two
 * shared-year reports (Monthly Cash Flow, Tax per Month) carry the active year
 * across each other (rule 3): when the current URL already carries `?year=`, that
 * selection follows the reader to the sibling month report; the other three are
 * all-time and link clean.
 */
export function ReportsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawYear = searchParams.get("year");
  const year = rawYear && /^\d{4}$/.test(rawYear) ? rawYear : undefined;

  const hrefFor = (tab: ReportTab): string =>
    tab.sharedYear && year !== undefined
      ? reportPath(tab.slug, { year })
      : reportPath(tab.slug);

  return (
    <nav
      aria-label="Reports"
      className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
      data-testid="reports-tabs"
    >
      <ul className="flex min-w-max gap-1 border-b">
        {REPORT_TABS.map((tab) => {
          const active = pathname === `/reports/${tab.slug}`;
          return (
            <li key={tab.slug}>
              <Link
                href={hrefFor(tab)}
                aria-current={active ? "page" : undefined}
                data-testid={`report-tab-${tab.slug}`}
                data-active={active ? "true" : undefined}
                className={cn(
                  "-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
