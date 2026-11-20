"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, Info } from "lucide-react";

import { LockedValue } from "@/components/affordance/locked-value";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPHP, formatRateAsPercent, toMoney } from "@/lib/money";
import { dealsPath } from "@/lib/routes";
import type {
  SourceMetrics,
  SourcePerformanceRow,
  SourcePerformanceTotal,
} from "@/lib/source-performance";

/**
 * M7.2 — the Source Performance table (PRD §6). Eleven columns per §3.3 in three
 * groups — Production (Deals · Booked · % · Avg), Cash (Collected · % Collected ·
 * Outstanding), Fast vs slow (Resale+Rental GCI · Resale+Rental Outstanding · Developer
 * GCI) — a sticky grouped header, all columns sortable, and the TOTAL row pinned last
 * and visually distinct. Every figure is the M7.1 aggregator's string; the component
 * computes NOTHING (the only "math" is client-side row SORTING, which never touches a
 * money value — it compares the pre-computed decimals).
 *
 * Read-only surface: every value wears the locked-computed affordance with a plain-
 * language formula on hover (§6 computed-only convention). Inline states: archived
 * sources carry an "(inactive)" muted badge (already in the label + a flag); a %
 * Collected above 100% carries the pass-through tooltip (§4 rule 8 — cash collected
 * includes referral-out amounts that pass through the source); zero-₱ cells render
 * "₱ 0.00", never blank (FR-M7-12). Each source name drills to the deal list filtered
 * to that source + the active year (FR-M7-09, the M7 v1 cross-link ahead of M9).
 */

type ColKey =
  | "source"
  | "deals"
  | "booked"
  | "pct"
  | "avg"
  | "collected"
  | "pctColl"
  | "outstanding"
  | "rrGci"
  | "rrOut"
  | "devGci";

type Group = "production" | "cash" | "fastSlow";

type ColumnDef = {
  key: ColKey;
  header: string;
  group: Group;
  align: "start" | "end";
  /** Sort key over the metrics; null sinks to the bottom regardless of direction. */
  sortValue: (m: SourceMetrics & { source: string }) => number | string | null;
};

const COLUMNS: readonly ColumnDef[] = [
  { key: "source", header: "Source", group: "production", align: "start", sortValue: (m) => m.source.toLowerCase() },
  { key: "deals", header: "Deals", group: "production", align: "end", sortValue: (m) => m.deals },
  { key: "booked", header: "Booked ₱", group: "production", align: "end", sortValue: (m) => num(m.bookedNetGci) },
  { key: "pct", header: "% of NET GCI", group: "production", align: "end", sortValue: (m) => numOrNull(m.pctOfNetGci) },
  { key: "avg", header: "Avg / deal", group: "production", align: "end", sortValue: (m) => numOrNull(m.avgNetGciPerDeal) },
  { key: "collected", header: "Collected ₱", group: "cash", align: "end", sortValue: (m) => num(m.collectedNet) },
  { key: "pctColl", header: "% Collected", group: "cash", align: "end", sortValue: (m) => numOrNull(m.pctCollected) },
  { key: "outstanding", header: "Outstanding ₱", group: "cash", align: "end", sortValue: (m) => num(m.outstandingNet) },
  { key: "rrGci", header: "R+R ₱", group: "fastSlow", align: "end", sortValue: (m) => num(m.resaleRentalNetGci) },
  { key: "rrOut", header: "R+R Outst.", group: "fastSlow", align: "end", sortValue: (m) => num(m.resaleRentalOutstanding) },
  { key: "devGci", header: "Developer ₱", group: "fastSlow", align: "end", sortValue: (m) => num(m.developerNetGci) },
];

// Column spans under each group header — Source (col 1) sits above no group.
const GROUP_META: readonly { key: Group; label: string; span: number }[] = [
  { key: "production", label: "Production", span: 4 },
  { key: "cash", label: "Cash", span: 3 },
  { key: "fastSlow", label: "Fast vs slow", span: 3 },
];

const FORMULA: Record<ColKey, string> = {
  source: "Lead source — the channel that produced the deal",
  deals: "Deals = number of deals booked from this source",
  booked: "Booked NET GCI = Σ NET GCI (earned & yours — net of VAT & referral-outs, EWT retained)",
  pct: "% of NET GCI = source Booked ÷ TOTAL Booked",
  avg: "Avg NET GCI / deal = Booked ÷ Deals",
  collected: "Collected NET = Σ cash actually collected (Net of VAT; EWT retained counts)",
  pctColl: "% Collected = Collected ÷ Booked",
  outstanding: "Outstanding NET = Σ balance still owed on open receivables",
  rrGci: "Resale + Rental NET GCI = Booked on Resale & Rental deals (fast-collecting)",
  rrOut: "Resale + Rental Outstanding = open balance on Resale & Rental deals",
  devGci: "Developer / Pre-selling NET GCI = Booked on Developer deals (slow pipeline)",
};

const PASS_THROUGH_NOTE =
  "Cash collected exceeds earned NET GCI here — the collection includes referral-out cash that passes through this source to the referrer.";

function num(v: string): number {
  return toMoney(v).toNumber();
}
function numOrNull(v: string | null): number | null {
  return v === null ? null : toMoney(v).toNumber();
}

/** A money cell that names its formula on hover — always "₱ 0.00" when zero, never blank (FR-M7-12). */
function MoneyF({ value, col, testId }: { value: string; col: ColKey; testId: string }) {
  return (
    <LockedValue align="end" hideIcon formula={FORMULA[col]} data-testid={testId}>
      {formatPHP(value)}
    </LockedValue>
  );
}

/** Avg / deal — money, or "—" on a zero-deal row (no average to take). */
function Avg({ value, testId }: { value: string | null; testId: string }) {
  return (
    <LockedValue
      align="end"
      hideIcon
      formula={value === null ? "Avg NET GCI / deal — undefined with 0 deals" : FORMULA.avg}
      data-testid={testId}
    >
      {value === null ? "—" : formatPHP(value)}
    </LockedValue>
  );
}

/** % of NET GCI — always defined here (denominator is the whole report). */
function PctOf({ value, testId }: { value: string | null; testId: string }) {
  return (
    <LockedValue align="end" hideIcon formula={FORMULA.pct} data-testid={testId}>
      {value === null ? "—" : formatRateAsPercent(value)}
    </LockedValue>
  );
}

/**
 * % Collected — may exceed 100% (pass-through referral cash, §4 rule 8). When it does,
 * the value is tinted and carries a visible ⓘ whose tooltip explains it (never capped).
 */
function PctColl({ value, testId }: { value: string | null; testId: string }) {
  if (value === null) {
    return (
      <LockedValue
        align="end"
        hideIcon
        formula="% Collected — undefined with ₱0.00 booked"
        data-testid={testId}
      >
        —
      </LockedValue>
    );
  }
  const over = toMoney(value).greaterThan(1);
  if (!over) {
    return (
      <LockedValue align="end" hideIcon formula={FORMULA.pctColl} data-testid={testId}>
        {formatRateAsPercent(value)}
      </LockedValue>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1" data-testid={testId}>
      <LockedValue
        align="end"
        hideIcon
        className="text-amber-700 dark:text-amber-300"
        formula={`${FORMULA.pctColl} — ${PASS_THROUGH_NOTE}`}
      >
        {formatRateAsPercent(value)}
      </LockedValue>
      <Tooltip>
        <TooltipTrigger
          render={<Info className="size-3.5 shrink-0 cursor-help text-amber-600 dark:text-amber-400" />}
          tabIndex={0}
          aria-label="Why is this over 100%?"
          data-testid={`${testId}-passthrough`}
        />
        <TooltipContent className="max-w-xs">{PASS_THROUGH_NOTE}</TooltipContent>
      </Tooltip>
    </span>
  );
}

/** The fast-vs-slow split bar (mobile card) — R+R share of Booked, green; developer, muted. */
function SplitBar({ row }: { row: SourcePerformanceRow }) {
  const booked = toMoney(row.bookedNetGci);
  if (booked.isZero()) return null;
  const fastPct = toMoney(row.resaleRentalNetGci).dividedBy(booked).times(100).toNumber();
  const clamped = Math.max(0, Math.min(100, fastPct));
  return (
    <div
      className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      data-testid="sp-split-bar"
      title={`Resale + Rental ${clamped.toFixed(0)}% · Developer ${(100 - clamped).toFixed(0)}%`}
    >
      <div className="h-full bg-emerald-500" style={{ width: `${clamped}%` }} />
      <div className="h-full bg-muted-foreground/40" style={{ width: `${100 - clamped}%` }} />
    </div>
  );
}

type Sort = { key: ColKey; dir: "asc" | "desc" };

export function SourcePerformanceTable({
  rows,
  total,
  year,
}: {
  rows: readonly SourcePerformanceRow[];
  total: SourcePerformanceTotal;
  year: number | "all";
}) {
  // Default: Booked NET GCI descending (the scorecard reading order, §4 rule 10). The
  // server already returns this order; the state seeds it so the header arrow shows.
  const [sort, setSort] = React.useState<Sort>({ key: "booked", dir: "desc" });

  const sorted = React.useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key)!;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      // Nulls (undefined avg / % on zero rows) always sink to the bottom.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  const toggleSort = (key: ColKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : // Numeric columns read most-useful high-to-low first; the label reads A→Z.
          { key, dir: key === "source" ? "asc" : "desc" }
    );

  const drillYear = year === "all" ? undefined : year;

  return (
    <section className="space-y-4" data-testid="source-performance">
      {/* desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-xl border lg:block">
        <table className="w-full text-sm" data-testid="source-table">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
            {/* group header row — Source is ungrouped, then Production / Cash / Fast vs slow */}
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 pt-2 pb-1 text-left font-medium" />
              {GROUP_META.map((g, i) => (
                <th
                  key={g.key}
                  colSpan={g.span}
                  className={`px-3 pt-2 pb-1 text-left font-semibold tracking-wide uppercase ${i > 0 ? "border-l" : ""}`}
                  data-testid={`group-${g.key}`}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            {/* column header row */}
            <tr>
              {COLUMNS.map((c) => {
                const groupStart =
                  c.key === "collected" || c.key === "rrGci" ? "border-l" : "";
                return (
                  <th
                    key={c.key}
                    className={`px-3 py-2 font-medium whitespace-nowrap ${c.align === "end" ? "text-right" : "text-left"} ${groupStart}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${c.align === "end" ? "flex-row-reverse" : ""}`}
                      data-testid={`sort-${c.key}`}
                    >
                      {c.header}
                      {sort.key === c.key &&
                        (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.leadSourceId}
                className="border-t hover:bg-muted/40"
                data-testid="source-row"
                data-source-id={row.leadSourceId}
              >
                <td className="px-3 py-2">
                  <Link
                    href={dealsPath({ source: row.leadSourceId, year: drillYear })}
                    className="group/src inline-flex items-center gap-1.5 text-left font-medium hover:underline"
                    data-testid="sp-source-link"
                  >
                    <span>{row.source}</span>
                    {row.archived && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]" data-testid="sp-inactive-badge">
                        inactive
                      </Badge>
                    )}
                    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/src:opacity-100" />
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <LockedValue align="end" hideIcon formula={FORMULA.deals} data-testid="sp-deals">
                    {row.deals}
                  </LockedValue>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <MoneyF value={row.bookedNetGci} col="booked" testId="sp-booked" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <PctOf value={row.pctOfNetGci} testId="sp-pct" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Avg value={row.avgNetGciPerDeal} testId="sp-avg" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums border-l">
                  <MoneyF value={row.collectedNet} col="collected" testId="sp-collected" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <PctColl value={row.pctCollected} testId="sp-pct-collected" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <MoneyF value={row.outstandingNet} col="outstanding" testId="sp-outstanding" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums border-l">
                  <MoneyF value={row.resaleRentalNetGci} col="rrGci" testId="sp-rr-gci" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <MoneyF value={row.resaleRentalOutstanding} col="rrOut" testId="sp-rr-out" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <MoneyF value={row.developerNetGci} col="devGci" testId="sp-dev-gci" />
                </td>
              </tr>
            ))}
          </tbody>
          {/* TOTAL — pinned last, visually distinct (§3.5). Its % of NET GCI is 100% by
              construction; % Collected & Avg are recomputed from totals by the service. */}
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold" data-testid="total-row">
              <td className="px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-deals">{total.deals}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-booked">{formatPHP(total.bookedNetGci)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-pct">
                {total.pctOfNetGci === null ? "—" : formatRateAsPercent(total.pctOfNetGci)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-avg">
                {total.avgNetGciPerDeal === null ? "—" : formatPHP(total.avgNetGciPerDeal)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums border-l" data-testid="total-collected">{formatPHP(total.collectedNet)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-pct-collected">
                {total.pctCollected === null ? "—" : formatRateAsPercent(total.pctCollected)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-outstanding">{formatPHP(total.outstandingNet)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums border-l" data-testid="total-rr-gci">{formatPHP(total.resaleRentalNetGci)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-rr-out">{formatPHP(total.resaleRentalOutstanding)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-dev-gci">{formatPHP(total.developerNetGci)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile / small cards (360px) — source + Booked, % of NET GCI, % Collected, split bar */}
      <ul className="space-y-2 lg:hidden" data-testid="source-cards">
        {sorted.map((row) => (
          <li
            key={row.leadSourceId}
            className="rounded-xl border p-3"
            data-testid="source-card"
            data-source-id={row.leadSourceId}
          >
            <Link
              href={dealsPath({ source: row.leadSourceId, year: drillYear })}
              className="flex items-center justify-between gap-2"
              data-testid="sp-card-link"
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                {row.source}
                {row.archived && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">inactive</Badge>
                )}
              </span>
              <span className="tabular-nums font-medium">{formatPHP(row.bookedNetGci)}</span>
            </Link>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">% of NET GCI</dt>
              <dd className="text-right tabular-nums">
                {row.pctOfNetGci === null ? "—" : formatRateAsPercent(row.pctOfNetGci)}
              </dd>
              <dt className="text-muted-foreground">% Collected</dt>
              <dd className="text-right tabular-nums">
                {row.pctCollected === null ? "—" : formatRateAsPercent(row.pctCollected)}
                {row.pctCollected !== null && toMoney(row.pctCollected).greaterThan(1) && (
                  <Info className="ml-1 inline size-3 text-amber-600 dark:text-amber-400" aria-label="includes pass-through cash" />
                )}
              </dd>
            </dl>
            <SplitBar row={row} />
          </li>
        ))}
        {/* TOTAL card */}
        <li className="rounded-xl border-2 bg-muted/50 p-3" data-testid="total-card">
          <div className="flex items-center justify-between gap-2 font-semibold">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatPHP(total.bookedNetGci)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Collected</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.collectedNet)}</dd>
            <dt className="text-muted-foreground">Outstanding</dt>
            <dd className="text-right tabular-nums">{formatPHP(total.outstandingNet)}</dd>
            <dt className="text-muted-foreground">% Collected</dt>
            <dd className="text-right tabular-nums">
              {total.pctCollected === null ? "—" : formatRateAsPercent(total.pctCollected)}
            </dd>
          </dl>
        </li>
      </ul>
    </section>
  );
}
