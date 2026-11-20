import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { equalsToCentavo, formatPHP, formatRateAsPercent, toMoney } from "@/lib/money";
import { collectiblesPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Aging, AgingBucket } from "@/lib/receivables/projections";

import { DashboardSection } from "./section";
import { SectionExport } from "./section-export";

/**
 * Section 4 — AGING OF OPEN BALANCES (M6 §3.3, FR-M6-05). Open receivables with a
 * balance, bucketed by months since last activity: # deals, Σ balance, % of the
 * outstanding. Every figure is the server builder's string — the table only formats
 * and drills down (no client math). Each bucket links to the ledger filtered to
 * exactly its open, balance-owing rows in that age band.
 *
 * THE TIE (§4 rule 4). The TOTAL must equal Section 1's Balance Outstanding. It does
 * whenever every open row still owes money; it differs by exactly the amount of any
 * open OVER-paid row (balance ≤ 0), which is excluded from the buckets by the
 * balance > 0 filter but still counted in Balance Outstanding as a negative — and
 * Data Health (b) is flagging that same row. We SURFACE that gap honestly rather
 * than hide it (the rule everyone gets wrong the other way).
 */

/** The workbook bucket key → the ledger's aging drill-down param (identical set). */
const BUCKET_PARAM: Record<
  AgingBucket["key"],
  "lt1" | "m1to3" | "m3to6" | "m6plus"
> = { lt1: "lt1", m1to3: "m1to3", m3to6: "m3to6", m6plus: "m6plus" };

function SharePct({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatRateAsPercent(value)}</span>;
}

export function AgingSection({
  data,
  balanceOutstanding,
}: {
  data: Aging;
  /** Section 1's Balance Outstanding — the figure the TOTAL must tie to. */
  balanceOutstanding: string;
}) {
  const totalCount = data.buckets.reduce((n, b) => n + b.count, 0);
  const ties = equalsToCentavo(data.totalBalance, balanceOutstanding);
  // The signed gap = Balance Outstanding − aging total; a negative value is the
  // over-paid open row(s) excluded from the buckets (rule 4 caveat).
  const gap = toMoney(balanceOutstanding).minus(toMoney(data.totalBalance)).toFixed(2);
  const totalShare = toMoney(data.totalBalance).isZero() ? null : "1";

  return (
    <DashboardSection
      index={4}
      title="Aging of Open Balances"
      description="Open balances bucketed by months since last activity. The year filter does not touch this."
      testId="section-aging"
      action={<SectionExport dataset="dashboard-aging" label="aging" />}
    >
      {/* desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border ring-1 ring-foreground/5 md:block">
        <table className="w-full text-sm" data-testid="aging-table">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium">Bucket</th>
              <th className="px-3 py-2.5 text-right font-medium"># Deals</th>
              <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              <th className="px-3 py-2.5 text-right font-medium">% of Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr
                key={b.key}
                className="border-t hover:bg-muted/40"
                data-testid="aging-row"
                data-bucket={b.key}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={collectiblesPath({
                      status: "open",
                      hasBalance: true,
                      bucket: BUCKET_PARAM[b.key],
                    })}
                    className="font-medium text-primary hover:underline"
                    data-testid={`aging-link-${b.key}`}
                  >
                    {b.label}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{b.count}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(b.balance)}</td>
                <td className="px-3 py-2.5 text-right">
                  <SharePct value={b.shareOfOutstanding} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/60">
            <tr className="font-medium" data-testid="aging-total">
              <td className="px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{totalCount}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="aging-total-balance">
                {formatPHP(data.totalBalance)}
              </td>
              <td className="px-3 py-2.5 text-right">
                <SharePct value={totalShare} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-2 md:hidden" data-testid="aging-cards">
        {data.buckets.map((b) => (
          <li key={b.key}>
            <Link
              href={collectiblesPath({
                status: "open",
                hasBalance: true,
                bucket: BUCKET_PARAM[b.key],
              })}
              className="flex items-center justify-between rounded-xl border p-3"
              data-testid="aging-card"
              data-bucket={b.key}
            >
              <div>
                <p className="font-medium text-primary">{b.label}</p>
                <p className="text-xs text-muted-foreground">
                  {b.count} deal{b.count === 1 ? "" : "s"} · <SharePctInline value={b.shareOfOutstanding} />
                </p>
              </div>
              <span className="tabular-nums font-medium">{formatPHP(b.balance)}</span>
            </Link>
          </li>
        ))}
        <li
          className="flex items-center justify-between rounded-xl border bg-muted/40 p-3 text-sm font-medium"
          data-testid="aging-total-card"
        >
          <span>TOTAL ({totalCount})</span>
          <span className="tabular-nums">{formatPHP(data.totalBalance)}</span>
        </li>
      </ul>

      {/* the tie indicator (rule 4) — shown, never hidden */}
      <p
        className={cn(
          "flex items-center gap-1.5 text-sm",
          ties ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
        )}
        data-testid="aging-tie"
        data-ties={ties ? "true" : "false"}
      >
        {ties ? (
          <>
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
            Ties to Balance Outstanding ({formatPHP(balanceOutstanding)}).
          </>
        ) : (
          <>
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Off Balance Outstanding ({formatPHP(balanceOutstanding)}) by {formatPHP(gap)} — an
            open over-paid balance sits outside the buckets and is flagged in Data Health below.
          </>
        )}
      </p>
    </DashboardSection>
  );
}

/** Inline share for the mobile card ("· 70.83%"). */
function SharePctInline({ value }: { value: string | null }) {
  return <span className="tabular-nums">{value === null ? "—" : formatRateAsPercent(value)}</span>;
}
