"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * M8.4 — the Print button on Report 4 (FR-M8-11). Report 4 is the agent's monthly
 * hand-off to their accountant; this triggers the browser print dialog against the
 * print stylesheet (globals.css `@media print`), which lays the twelve months + TOTAL
 * onto one portrait page under a header block (workspace · report · year · generated).
 *
 * A client component only because it calls `window.print()`; it renders nothing that
 * the server could not, and it is itself `no-print` so it never appears on the page it
 * produces.
 */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      data-testid="report-print"
      aria-label="Print this report"
    >
      <Printer className="size-4" /> {label}
    </Button>
  );
}
