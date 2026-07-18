import { Suspense } from "react";
import type { Metadata } from "next";

import { ReportsTabs } from "@/components/reports/reports-tabs";
import { ReadingGuide } from "@/components/reports/reading-guide";

export const metadata: Metadata = { title: "Reports" };

/**
 * M8.3 — the Reports area shell. Five deep-linkable report tabs (FR-M8-01) sit in a
 * sticky header above the active report; the two-year-semantics reading guide (§1)
 * is always available beneath them so a non-real-estate reader never confuses paid
 * year with booking year. Each tab is its own route (`/reports/<slug>`), so the
 * active report renders as {children}.
 */
export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="no-print sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pt-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mb-3 text-sm text-muted-foreground">
          Read-only collection reports over your payments, deals, and receivables.
        </p>
        {/* useSearchParams needs a Suspense boundary to keep the route streamable. */}
        <Suspense fallback={<div className="h-11" />}>
          <ReportsTabs />
        </Suspense>
      </div>

      <div className="no-print">
        <ReadingGuide />
      </div>

      {children}
    </div>
  );
}
