"use client";

import * as React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Search, TriangleAlert } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { SelectField } from "@/components/affordance/select-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPHP, formatRateAsPercent, toMoney } from "@/lib/money";
import { collectibleDetailPath, exportPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  AGING_LABELS,
  agingBucketOf,
  type AgingBucketKey,
} from "@/lib/receivables/projections";
import type { ReceivableRow } from "@/lib/receivables/queries";
import type { ReceivableStatus } from "@/types/entities";

/** The ₱0.50 Data Health tolerance for the closed-variance drill-down filter (c). */
const VARIANCE_TOLERANCE = toMoney("0.50");

/**
 * The receivables ledger (FR-M4-08, §6) — the module's home screen. A sticky-header
 * table on the desktop, reflowing cards at 360 px; both driven by the same rows the
 * server RLS-scoped and default-sorted by chase priority (Rule Q). Filtering,
 * sorting, the pinned totals row and pagination all run client-side over those rows
 * — 1,000 filter/sort in well under the §8 budget with no second round-trip.
 *
 * The totals row sums the FILTERED set at full precision (the stored ::text money
 * strings through the Money type), never the rounded displays, so it ties to the
 * centavo. Export downloads the current filtered view (AC8).
 */

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** Open = neutral, Closed = green, Cancelled = grey (§6). */
function StatusChip({ status }: { status: ReceivableStatus }) {
  return (
    <span
      data-testid={`status-chip-${status}`}
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-4xl px-2 py-0.5 text-xs font-medium",
        status === "open" && "bg-secondary text-secondary-foreground",
        status === "closed" &&
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
        status === "cancelled" && "bg-muted text-muted-foreground"
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A compact % progress bar; null (zero-collectible) renders an em dash. */
function PctBar({ pct }: { pct: string | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const ratio = Math.max(0, Math.min(1, Number(pct)));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground">
        {formatRateAsPercent(pct)}
      </span>
    </div>
  );
}

function payorOf(r: ReceivableRow): string {
  if (r.deal_type === "developer") return r.developer?.name ?? r.client_name;
  return r.client_name;
}

type SortKey = "chase" | "deal_code" | "total_collectible" | "collected_net" | "balance" | "months_idle";

function moneyNum(v: string | null): number {
  return v === null ? Number.NEGATIVE_INFINITY : toMoney(v).toNumber();
}

const PAGE_SIZE = 50;

/**
 * Initial filter state seeded from a dashboard drill-down (M6 §6, FR-M6-12). A
 * position tile links to e.g. `?status=open&hasBalance=true`; the collectibles page
 * parses those params and passes them here so the ledger opens on exactly the rows
 * the tile aggregated. Absent → the ledger's own defaults (all rows).
 */
export type LedgerInitialFilters = {
  status?: "all" | ReceivableStatus;
  developer?: string;
  onlyWithBalance?: boolean;
  overriddenOnly?: boolean;
  /** Aging drill-down (§4): open, balance-owing rows in this age bucket. */
  bucket?: "all" | AgingBucketKey;
  /** Data Health (b) drill-down: Open rows paid in full or over (balance ≤ 0). */
  overpaidOnly?: boolean;
  /** Data Health (c) drill-down: Closed rows short/over by more than ₱0.50. */
  varianceOverTolerance?: boolean;
};

const AGE_OPTIONS: readonly { value: "all" | AgingBucketKey; label: string }[] = [
  { value: "all", label: "All ages" },
  { value: "lt1", label: AGING_LABELS.lt1 },
  { value: "m1to3", label: AGING_LABELS.m1to3 },
  { value: "m3to6", label: AGING_LABELS.m3to6 },
  { value: "m6plus", label: AGING_LABELS.m6plus },
];

/** An open, balance-owing row — the aging/chase membership test, mirrored here. */
function isOpenWithBalance(r: ReceivableRow): boolean {
  return r.status === "open" && r.balance !== null && toMoney(r.balance).greaterThan(0);
}

export type ReceivablesLedgerProps = {
  receivables: readonly ReceivableRow[];
  /** M6's ⚠-chase threshold from tax settings — a row idle ≥ this is flagged. */
  chaseIdleMonths: number;
  initialFilters?: LedgerInitialFilters;
};

export function ReceivablesLedger({
  receivables,
  chaseIdleMonths,
  initialFilters,
}: ReceivablesLedgerProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ReceivableStatus>(
    initialFilters?.status ?? "all"
  );
  const [developer, setDeveloper] = useState(initialFilters?.developer ?? "all");
  const [year, setYear] = useState("all");
  const [onlyWithBalance, setOnlyWithBalance] = useState(
    initialFilters?.onlyWithBalance ?? false
  );
  const [overriddenOnly, setOverriddenOnly] = useState(
    initialFilters?.overriddenOnly ?? false
  );
  const [bucket, setBucket] = useState<"all" | AgingBucketKey>(
    initialFilters?.bucket ?? "all"
  );
  const [overpaidOnly, setOverpaidOnly] = useState(
    initialFilters?.overpaidOnly ?? false
  );
  const [varianceOverTolerance, setVarianceOverTolerance] = useState(
    initialFilters?.varianceOverTolerance ?? false
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "chase",
    dir: "desc",
  });
  const [page, setPage] = useState(1);

  const years = useMemo(
    () => Array.from(new Set(receivables.map((r) => r.booked_year))).sort((a, b) => b - a),
    [receivables]
  );

  // Unique developers present, for the filter — derived from the rows, no query.
  const developers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of receivables) {
      if (r.developer_id && r.developer?.name) map.set(r.developer_id, r.developer.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [receivables]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = receivables.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (developer !== "all") {
        if (developer === "none" ? r.developer_id !== null : r.developer_id !== developer)
          return false;
      }
      if (year !== "all" && String(r.booked_year) !== year) return false;
      if (onlyWithBalance && !(r.balance !== null && toMoney(r.balance).greaterThan(0)))
        return false;
      if (overriddenOnly && r.confirmed_collectible === null) return false;
      // Aging bucket (§4): only open, balance-owing rows age; match the live age.
      if (bucket !== "all") {
        if (!isOpenWithBalance(r) || r.age_months === null) return false;
        if (agingBucketOf(r.age_months) !== bucket) return false;
      }
      // Data Health (b): Open and paid in full or over (signed balance ≤ 0).
      if (overpaidOnly && !(r.status === "open" && r.balance !== null && toMoney(r.balance).lessThanOrEqualTo(0)))
        return false;
      // Data Health (c): Closed and short/over by more than ₱0.50 (|variance| > 0.50).
      if (
        varianceOverTolerance &&
        !(r.status === "closed" && r.variance !== null && toMoney(r.variance).abs().greaterThan(VARIANCE_TOLERANCE))
      )
        return false;
      if (needle) {
        const hay = `${r.deal_code} ${r.client_name} ${r.property_details}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    // "chase" preserves the server's Rule Q order; other keys re-sort.
    if (sort.key !== "chase") {
      rows.sort((a, b) => {
        let cmp: number;
        if (sort.key === "deal_code") cmp = a.deal_code.localeCompare(b.deal_code);
        else if (sort.key === "months_idle")
          cmp = (a.months_idle ?? -1) - (b.months_idle ?? -1);
        else {
          const key = sort.key as "total_collectible" | "collected_net" | "balance";
          cmp = moneyNum(a[key]) - moneyNum(b[key]);
        }
        return sort.dir === "asc" ? cmp : -cmp;
      });
    } else if (sort.dir === "asc") {
      rows.reverse();
    }
    return rows;
  }, [receivables, search, status, developer, year, onlyWithBalance, overriddenOnly, bucket, overpaidOnly, varianceOverTolerance, sort]);

  // Full-precision totals of the FILTERED set (stored strings, never displays).
  const totals = useMemo(() => {
    let collectible = toMoney("0");
    let collected = toMoney("0");
    let balance = toMoney("0");
    for (const r of filtered) {
      collectible = collectible.plus(toMoney(r.total_collectible));
      collected = collected.plus(toMoney(r.collected_net));
      if (r.balance !== null) balance = balance.plus(toMoney(r.balance));
    }
    return {
      collectible: collectible.toFixed(2),
      collected: collected.toFixed(2),
      balance: balance.toFixed(2),
    };
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  React.useEffect(
    () => setPage(1),
    [search, status, developer, year, onlyWithBalance, overriddenOnly, bucket, overpaidOnly, varianceOverTolerance]
  );

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );

  // The download honours the on-screen filters (AC8).
  const exportQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (developer !== "all") p.set("developer", developer);
    if (year !== "all") p.set("year", year);
    if (onlyWithBalance) p.set("hasBalance", "true");
    if (overriddenOnly) p.set("overridden", "true");
    if (bucket !== "all") p.set("bucket", bucket);
    if (overpaidOnly) p.set("overpaid", "true");
    if (varianceOverTolerance) p.set("variance", "over-tolerance");
    if (search.trim()) p.set("q", search.trim());
    const s = p.toString();
    return s ? `&${s}` : "";
  }, [status, developer, year, onlyWithBalance, overriddenOnly, bucket, overpaidOnly, varianceOverTolerance, search]);

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="rec-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <InputField
              id="rec-search"
              affordance="plain"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, client or property"
              className="pl-8"
              data-testid="rec-search"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-status">Status</Label>
          <SelectField
            id="rec-status"
            affordance="plain"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-32"
            options={[
              { value: "all", label: "All statuses" },
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            data-testid="rec-status"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-developer">Developer</Label>
          <SelectField
            id="rec-developer"
            affordance="plain"
            value={developer}
            onChange={(e) => setDeveloper(e.target.value)}
            className="w-44"
            options={[
              { value: "all", label: "All developers" },
              { value: "none", label: "Resale / Rental" },
              ...developers.map(([id, name]) => ({ value: id, label: name })),
            ]}
            data-testid="rec-developer"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-age">Age</Label>
          <SelectField
            id="rec-age"
            affordance="plain"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as "all" | AgingBucketKey)}
            className="w-32"
            options={AGE_OPTIONS}
            data-testid="rec-age"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-year">Year</Label>
          <SelectField
            id="rec-year"
            affordance="plain"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-28"
            options={[
              { value: "all", label: "All years" },
              ...years.map((y) => ({ value: String(y), label: String(y) })),
            ]}
            data-testid="rec-year"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={`${exportPath("receivables", "csv")}${exportQuery}`} />} data-testid="export-csv">
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={`${exportPath("receivables", "xlsx")}${exportQuery}`} />} data-testid="export-xlsx">
            <Download className="size-4" /> XLSX
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={onlyWithBalance}
              onCheckedChange={(v) => setOnlyWithBalance(v === true)}
              data-testid="only-with-balance"
            />
            Only with balance
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={overriddenOnly}
              onCheckedChange={(v) => setOverriddenOnly(v === true)}
              data-testid="overridden-only"
            />
            Overridden only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={overpaidOnly}
              onCheckedChange={(v) => setOverpaidOnly(v === true)}
              data-testid="overpaid-only"
            />
            Fully paid / over (≤ 0)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={varianceOverTolerance}
              onCheckedChange={(v) => setVarianceOverTolerance(v === true)}
              data-testid="variance-over-tolerance"
            />
            Variance &gt; ₱0.50
          </label>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="result-count">
          {filtered.length} {filtered.length === 1 ? "receivable" : "receivables"}
        </p>
      </div>

      {/* desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm" data-testid="receivable-table">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
            <tr>
              <SortHeader label="Deal" k="deal_code" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2.5 text-left font-medium">Payor</th>
              <SortHeader label="Total Collectible" k="total_collectible" align="end" sort={sort} onSort={toggleSort} />
              <SortHeader label="Collected" k="collected_net" align="end" sort={sort} onSort={toggleSort} />
              <SortHeader label="Balance" k="balance" align="end" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2.5 text-right font-medium">% Collected</th>
              <SortHeader label="Months idle" k="months_idle" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <LedgerRow key={r.id} r={r} chaseIdleMonths={chaseIdleMonths} />
            ))}
          </tbody>
          {/* pinned totals row (filtered set, full precision) */}
          <tfoot className="sticky bottom-0 border-t-2 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
            <tr data-testid="totals-row" className="font-medium">
              <td className="px-3 py-2.5" colSpan={2}>
                Totals ({filtered.length})
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-collectible">
                {formatPHP(totals.collectible)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-collected">
                {formatPHP(totals.collected)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-balance">
                {formatPHP(totals.balance)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-2 md:hidden" data-testid="receivable-cards">
        {pageRows.map((r) => (
          <li key={r.id}>
            <LedgerCard r={r} chaseIdleMonths={chaseIdleMonths} />
          </li>
        ))}
        <li className="rounded-xl border bg-muted/40 p-3 text-sm font-medium" data-testid="totals-card">
          <div className="flex justify-between">
            <span>Total Collectible</span>
            <span className="tabular-nums">{formatPHP(totals.collectible)}</span>
          </div>
          <div className="flex justify-between">
            <span>Collected</span>
            <span className="tabular-nums">{formatPHP(totals.collected)}</span>
          </div>
          <div className="flex justify-between">
            <span>Balance</span>
            <span className="tabular-nums">{formatPHP(totals.balance)}</span>
          </div>
        </li>
      </ul>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            data-testid="page-prev"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="page-indicator">
            Page {clampedPage} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={clampedPage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            data-testid="page-next"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  k,
  align = "start",
  sort,
  onSort,
}: {
  label: string;
  k: SortKey;
  align?: "start" | "end";
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
}) {
  return (
    <th className={cn("px-3 py-2.5 font-medium whitespace-nowrap", align === "end" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "end" && "flex-row-reverse")}
        data-testid={`sort-${k}`}
      >
        {label}
        {sort.key === k &&
          (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}

/** The overridden Total Collectible affordance — the sheet's "blue" input cell. */
function CollectibleCell({ r }: { r: ReceivableRow }) {
  if (r.confirmed_collectible === null) {
    return <span className="tabular-nums">{formatPHP(r.total_collectible)}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        tabIndex={0}
        className="cursor-help"
        render={
          <span
            data-testid="overridden-collectible"
            className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 tabular-nums text-sky-900 dark:bg-sky-950/60 dark:text-sky-200"
          >
            {formatPHP(r.total_collectible)}
            <span aria-hidden="true" className="text-[10px]">●</span>
          </span>
        }
      />
      <TooltipContent>
        Confirmed override. Default {formatPHP(r.default_total_collectible)} → confirmed{" "}
        {formatPHP(r.confirmed_collectible)}.
      </TooltipContent>
    </Tooltip>
  );
}

/** Months-idle cell: "no payment yet" (open, null), "—" (closed), or ⚠ when chasing. */
function IdleCell({ r, chaseIdleMonths }: { r: ReceivableRow; chaseIdleMonths: number }) {
  if (r.months_idle === null) {
    return (
      <span className="text-xs text-muted-foreground">
        {r.status === "open" ? "no payment yet" : "—"}
      </span>
    );
  }
  const chasing = r.months_idle >= chaseIdleMonths;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        chasing && "font-medium text-amber-700 dark:text-amber-300"
      )}
      data-testid={chasing ? "chase-flag" : undefined}
      title={chasing ? `Idle ${r.months_idle} months — chase this payor.` : undefined}
    >
      {chasing && <TriangleAlert className="size-3.5" />}
      {r.months_idle}
    </span>
  );
}

function LedgerRow({ r, chaseIdleMonths }: { r: ReceivableRow; chaseIdleMonths: number }) {
  const negative = r.balance !== null && toMoney(r.balance).isNegative();
  return (
    <tr className="border-t hover:bg-muted/40" data-testid="receivable-row" data-code={r.deal_code}>
      <td className="px-3 py-2.5">
        <Link
          href={collectibleDetailPath(r.deal_code)}
          className="font-medium text-primary hover:underline"
          data-testid="receivable-link"
        >
          {r.deal_code}
        </Link>
        <span className="block text-xs text-muted-foreground">{r.client_name}</span>
      </td>
      <td className="px-3 py-2.5">{payorOf(r)}</td>
      <td className="px-3 py-2.5 text-right">
        <span className="inline-flex items-center gap-1">
          <CollectibleCell r={r} />
          {r.override_review_flagged_at !== null && (
            <Link
              href={collectibleDetailPath(r.deal_code)}
              className="rounded bg-amber-100 px-1 text-[10px] font-medium uppercase text-amber-800 hover:underline dark:bg-amber-950/60 dark:text-amber-200"
              title="The deal was edited after this confirmed collectible was set — review it."
              data-testid="override-review-flag"
            >
              review
            </Link>
          )}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(r.collected_net)}</td>
      <td
        className={cn("px-3 py-2.5 text-right tabular-nums", negative && "font-medium text-destructive")}
        title={negative ? "Over-collected — close it or confirm the collectible." : undefined}
      >
        {r.balance === null ? "—" : formatPHP(r.balance)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <PctBar pct={r.pct_collected} />
      </td>
      <td className="px-3 py-2.5">
        <IdleCell r={r} chaseIdleMonths={chaseIdleMonths} />
      </td>
      <td className="px-3 py-2.5">
        <StatusChip status={r.status} />
      </td>
    </tr>
  );
}

function LedgerCard({ r, chaseIdleMonths }: { r: ReceivableRow; chaseIdleMonths: number }) {
  const negative = r.balance !== null && toMoney(r.balance).isNegative();
  return (
    <Link
      href={collectibleDetailPath(r.deal_code)}
      className="block rounded-xl border p-3"
      data-testid="receivable-card"
      data-code={r.deal_code}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium text-primary">{r.deal_code}</span>
          <span className="ml-2 truncate text-sm text-muted-foreground">{r.client_name}</span>
        </div>
        <StatusChip status={r.status} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className={cn("text-lg font-semibold tabular-nums", negative && "text-destructive")}>
            {r.balance === null ? "—" : formatPHP(r.balance)}
          </p>
        </div>
        <div className="text-right">
          <IdleCell r={r} chaseIdleMonths={chaseIdleMonths} />
          <p className="text-xs text-muted-foreground">
            {formatPHP(r.collected_net)} of {formatPHP(r.total_collectible)}
          </p>
        </div>
      </div>
    </Link>
  );
}
