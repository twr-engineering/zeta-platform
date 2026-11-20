import { Info } from "lucide-react";

/**
 * M8.3 — the reading guide / two-year-semantics explainer (§1, consumed by M10).
 * The one thing a non-real-estate reader must not confuse: these reports group by
 * two DIFFERENT years, and which one a report uses is fixed (rule 1). A `<details>`
 * so it's always available but never in the way — collapsed by default, no JS.
 */
export function ReadingGuide() {
  return (
    <details
      className="group rounded-xl border bg-muted/30"
      data-testid="reports-reading-guide"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
        <Info className="size-4 text-muted-foreground" aria-hidden="true" />
        Which year is which? (paid year vs booking year)
        <span className="ml-auto text-xs text-muted-foreground group-open:hidden">
          Show
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">
          Hide
        </span>
      </summary>
      <div className="space-y-3 border-t px-4 py-3 text-sm text-muted-foreground">
        <p>
          These reports group cash by two different years — never the same thing:
        </p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-background p-3">
            <dt className="font-medium text-foreground">Year (paid)</dt>
            <dd className="mt-1">
              The calendar year the cash actually arrived. Groups{" "}
              <strong>Cash per Year</strong>, <strong>Monthly Cash Flow</strong>,{" "}
              <strong>Tax per Month</strong>, and the matrix <em>rows</em>.
            </dd>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <dt className="font-medium text-foreground">Deal Year (booking year)</dt>
            <dd className="mt-1">
              The calendar year the deal was booked. Groups the{" "}
              <strong>Booking-Year Summary</strong> and the matrix{" "}
              <em>columns</em>.
            </dd>
          </div>
        </dl>
        <p>
          A payment collected in <strong>2028</strong> on a deal booked in{" "}
          <strong>2026</strong> has Year (paid) = 2028 and Deal Year = 2026. That gap
          — developers releasing pre-selling commissions over several years as unit
          buyers pay — is exactly what the Vintage Matrix visualizes.
        </p>
      </div>
    </details>
  );
}
