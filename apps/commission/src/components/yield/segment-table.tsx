import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { LockedValue } from "@/components/affordance/locked-value";
import { formatPHP, formatRateAsPercent, formatYield, toMoney } from "@/lib/money";
import { dealsPath, type DealSegmentFilter } from "@/lib/routes";
import type { ReportRowKey, SegmentRow, YearFilter, YieldSummaryReport } from "@/lib/yield";

/**
 * M2.4 — the five-segment table (PRD §6): Resale, Developer, SALES SUBTOTAL
 * (emphasized — it feeds planning), Rental "(on rent)", Referral "(fees)"; columns
 * Deals · Volume · GCI (Net of VAT) · Realized Yield · Share of Sales. Every value
 * wears the locked-computed affordance with a plain-language formula on hover (§6);
 * clicking a segment name drills to the M1 deal list pre-filtered to that segment's
 * predicate + the report year (FR-M2-12), so every aggregate is auditable to its
 * deals. Below the table: TOTAL GCI (ALL OPERATIONS) and the two memo lines, in muted
 * styling with the sheet's verbatim "already inside the GCI figures above" caption —
 * memos are decomposition, NEVER added to any total (Rule 11 / M1 Rule H).
 *
 * ZERO client math: every number is the server reducer's value (reportFromAggregates).
 * Realized yield renders at 4 dp with the fixtures' precision (the workbook + the M1
 * deal list both show yields at 4 dp); the "—" em-dash is an undefined ratio (volume
 * or sales-volume 0), never a division error (Rule 5).
 */

const ROW_META: Record<
  ReportRowKey,
  { label: string; hint?: string; segment: DealSegmentFilter; subtotal?: boolean }
> = {
  resale: { label: "Resale", segment: "resale" },
  developer: { label: "Developer", hint: "pre-selling + RFO", segment: "developer" },
  sales_subtotal: { label: "SALES SUBTOTAL", segment: "sales", subtotal: true },
  rental: { label: "Rental", hint: "on rent", segment: "rental" },
  referral: { label: "Referral", hint: "fees", segment: "referral" },
};

/** "-75000.00" → "(₱ 75,000.00)"; "0.00" → "₱ 0.00". */
function formatParenMoney(signed: string): string {
  const v = toMoney(signed);
  return v.isNegative() ? `(${formatPHP(v.negated().toFixed(2))})` : formatPHP(v.toFixed(2));
}

function YieldCell({ rate }: { rate: string | null }) {
  if (rate === null) {
    return (
      <LockedValue align="end" hideIcon formula="Realized Yield = GCI ÷ Volume — undefined when Volume is ₱0.00">
        —
      </LockedValue>
    );
  }
  return (
    <LockedValue
      align="end"
      hideIcon
      formula={`Realized Yield = GCI ÷ Volume = ${formatYield(rate)}`}
    >
      {formatYield(rate)}
    </LockedValue>
  );
}

function ShareCell({ share }: { share: string | null }) {
  if (share === null) {
    return (
      <LockedValue align="end" hideIcon formula="Share of Sales = segment Volume ÷ SALES SUBTOTAL Volume — not part of the sales mix">
        —
      </LockedValue>
    );
  }
  return (
    <LockedValue align="end" hideIcon formula="Share of Sales = segment Volume ÷ SALES SUBTOTAL Volume">
      {formatRateAsPercent(share)}
    </LockedValue>
  );
}

function SegmentName({ row, year }: { row: SegmentRow; year: YearFilter }) {
  const meta = ROW_META[row.key];
  return (
    <Link
      href={dealsPath({ segment: meta.segment, year })}
      className="group/seg inline-flex items-center gap-1.5 text-left hover:underline"
      data-testid={`segment-drill-${meta.segment}`}
    >
      <span className={meta.subtotal ? "font-semibold" : "font-medium"}>{meta.label}</span>
      {meta.hint && <span className="text-xs text-muted-foreground">({meta.hint})</span>}
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/seg:opacity-100" />
    </Link>
  );
}

export function SegmentTable({ report }: { report: YieldSummaryReport }) {
  const year = report.yearFilter;

  return (
    <section className="space-y-4" data-testid="segment-report">
      <div className="overflow-x-auto rounded-xl border">
        {/* desktop / tablet table */}
        <table className="hidden w-full text-sm sm:table" data-testid="segment-table">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium">Segment</th>
              <th className="px-3 py-2.5 text-right font-medium">Deals</th>
              <th className="px-3 py-2.5 text-right font-medium">Volume</th>
              <th className="px-3 py-2.5 text-right font-medium">GCI (Net of VAT)</th>
              <th className="px-3 py-2.5 text-right font-medium">Realized Yield</th>
              <th className="px-3 py-2.5 text-right font-medium">Share of Sales</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const meta = ROW_META[row.key];
              return (
                <tr
                  key={row.key}
                  className={`border-t ${meta.subtotal ? "bg-muted/40 font-medium" : ""}`}
                  data-testid={`segment-row-${row.key}`}
                >
                  <td className="px-3 py-2.5">
                    <SegmentName row={row} year={year} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`${row.key}-deals`}>
                    <LockedValue align="end" hideIcon>{row.deals}</LockedValue>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`${row.key}-volume`}>
                    <LockedValue align="end" hideIcon formula="Volume = Σ List Price">
                      {formatPHP(row.volume)}
                    </LockedValue>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`${row.key}-gci`}>
                    <LockedValue align="end" hideIcon formula="GCI = Σ NET GCI (Net of VAT)">
                      {formatPHP(row.gci)}
                    </LockedValue>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`${row.key}-yield`}>
                    <YieldCell rate={row.realizedYield} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`${row.key}-share`}>
                    <ShareCell share={row.shareOfSales} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* mobile per-segment cards (360px) — Deals / Volume / GCI / Yield stacked */}
        <ul className="divide-y sm:hidden" data-testid="segment-cards">
          {report.rows.map((row) => {
            const meta = ROW_META[row.key];
            return (
              <li
                key={row.key}
                className={`p-3 ${meta.subtotal ? "bg-muted/40" : ""}`}
                data-testid={`segment-card-${row.key}`}
              >
                <SegmentName row={row} year={year} />
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Deals</dt>
                  <dd className="text-right tabular-nums">{row.deals}</dd>
                  <dt className="text-muted-foreground">Volume</dt>
                  <dd className="text-right tabular-nums">{formatPHP(row.volume)}</dd>
                  <dt className="text-muted-foreground">GCI (Net of VAT)</dt>
                  <dd className="text-right tabular-nums">{formatPHP(row.gci)}</dd>
                  <dt className="text-muted-foreground">Realized Yield</dt>
                  <dd className="text-right tabular-nums">
                    {row.realizedYield === null ? "—" : formatYield(row.realizedYield)}
                  </dd>
                  <dt className="text-muted-foreground">Share of Sales</dt>
                  <dd className="text-right tabular-nums">
                    {row.shareOfSales === null ? "—" : formatRateAsPercent(row.shareOfSales)}
                  </dd>
                </dl>
              </li>
            );
          })}
        </ul>
      </div>

      {/* TOTAL GCI (ALL OPERATIONS) + the two memo lines */}
      <div className="space-y-1.5 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">TOTAL GCI (ALL OPERATIONS)</span>
          <LockedValue
            align="end"
            hideIcon
            className="text-base font-semibold tabular-nums"
            formula="TOTAL GCI (ALL OPERATIONS) = Sales GCI + Rental GCI + Referral GCI"
            data-testid="total-gci"
          >
            {formatPHP(report.totalGciAllOps)}
          </LockedValue>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Incentives (+)</span>
          <span className="tabular-nums" data-testid="memo-incentives">
            {formatPHP(report.memoIncentives)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Referral-outs (−)</span>
          <span className="tabular-nums" data-testid="memo-referral-outs">
            {formatParenMoney(report.memoReferralOuts)}
          </span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          memo — already inside the GCI figures above
        </p>
      </div>
    </section>
  );
}
