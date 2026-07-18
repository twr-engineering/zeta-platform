import Link from "next/link";

import { formatPHP, formatRateAsPercent } from "@/lib/money";
import { collectiblesPath } from "@/lib/routes";
import type { DeveloperRollup } from "@/lib/receivables/projections";

import { DashboardSection } from "./section";
import { SectionExport } from "./section-export";

/**
 * Section 5 — RECEIVABLES BY DEVELOPER (M6 §3.3, FR-M6-06). One row per developer
 * with ≥ 1 deal, plus the "Resale / Rental (no developer)" row, plus TOTAL. Columns:
 * deals with a balance, Σ balance, Σ collected net (all statuses), % collected, and
 * the average days to first release (1 dp, the sheet's precision; "—" when the
 * developer has no released payment). Every figure is the server builder's string —
 * no client math. Each developer row drills into that developer's receivables; the
 * no-developer row drills into the resale/rental (blank-developer) set.
 */

/** "—" (no release), a signed 1-dp day count otherwise (negatives are legal). */
function AvgDays({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{value}</span>;
}

function PctCollected({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatRateAsPercent(value)}</span>;
}

/** Developer rows drill to their receivables; the no-developer row to resale/rental. */
function developerHref(row: DeveloperRollup): string {
  return collectiblesPath({ developer: row.developerId ?? "none" });
}

export function ByDeveloperSection({
  data,
}: {
  data: { rows: DeveloperRollup[]; total: DeveloperRollup };
}) {
  const { rows, total } = data;

  return (
    <DashboardSection
      index={5}
      title="Receivables by Developer"
      description="Who owes what, per payor, plus collection speed. The year filter does not touch this."
      testId="section-by-developer"
      action={<SectionExport dataset="dashboard-by-developer" label="receivables by developer" />}
    >
      {/* desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border ring-1 ring-foreground/5 md:block">
        <table className="w-full text-sm" data-testid="by-developer-table">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium">Developer</th>
              <th className="px-3 py-2.5 text-right font-medium">Deals w/ Balance</th>
              <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              <th className="px-3 py-2.5 text-right font-medium">Collected Net</th>
              <th className="px-3 py-2.5 text-right font-medium">% Collected</th>
              <th className="px-3 py-2.5 text-right font-medium">Avg Days → 1st</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.developerId ?? "none"}
                className="border-t hover:bg-muted/40"
                data-testid="by-developer-row"
                data-developer={row.developerId ?? "none"}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={developerHref(row)}
                    className="font-medium text-primary hover:underline"
                    data-testid={`by-developer-link-${row.developerId ?? "none"}`}
                  >
                    {row.developerName}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.dealsWithBalance}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(row.balance)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(row.collectedNet)}</td>
                <td className="px-3 py-2.5 text-right"><PctCollected value={row.pctCollected} /></td>
                <td className="px-3 py-2.5 text-right"><AvgDays value={row.avgDaysToFirstRelease} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/60">
            <tr className="font-medium" data-testid="by-developer-total">
              <td className="px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{total.dealsWithBalance}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="by-developer-total-balance">
                {formatPHP(total.balance)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="by-developer-total-collected">
                {formatPHP(total.collectedNet)}
              </td>
              <td className="px-3 py-2.5 text-right"><PctCollected value={total.pctCollected} /></td>
              <td className="px-3 py-2.5 text-right"><AvgDays value={total.avgDaysToFirstRelease} /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-2 md:hidden" data-testid="by-developer-cards">
        {rows.map((row) => (
          <li key={row.developerId ?? "none"}>
            <Link
              href={developerHref(row)}
              className="block rounded-xl border p-3"
              data-testid="by-developer-card"
              data-developer={row.developerId ?? "none"}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-primary">{row.developerName}</span>
                <span className="tabular-nums font-medium">{formatPHP(row.balance)}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>Collected</span>
                <span className="text-right tabular-nums">{formatPHP(row.collectedNet)}</span>
                <span>% Collected</span>
                <span className="text-right"><PctCollected value={row.pctCollected} /></span>
                <span>Avg Days → 1st</span>
                <span className="text-right"><AvgDays value={row.avgDaysToFirstRelease} /></span>
                <span>Deals w/ balance</span>
                <span className="text-right tabular-nums">{row.dealsWithBalance}</span>
              </div>
            </Link>
          </li>
        ))}
        <li
          className="rounded-xl border bg-muted/40 p-3 text-sm font-medium"
          data-testid="by-developer-total-card"
        >
          <div className="flex items-center justify-between">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatPHP(total.balance)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Collected {formatPHP(total.collectedNet)}</span>
            <span><PctCollected value={total.pctCollected} /></span>
          </div>
        </li>
      </ul>
    </DashboardSection>
  );
}
