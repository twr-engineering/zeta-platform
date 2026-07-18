"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatManilaDate } from "@/lib/date/manila";
import { formatPHP } from "@/lib/money";
import { DEAL_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/deals/labels";
import {
  collectibleDetailPath,
  dealDetailPath,
  paymentEditPath,
} from "@/lib/routes";
import type {
  CollectibleSearchRow,
  DealSearchRow,
  PaymentSearchRow,
  SearchResult,
} from "@/lib/search/types";
import type { ReceivableStatus } from "@/types/entities";

/**
 * M9 — the per-source result tables (§3.2 columns) plus their 360px card reflow
 * (§6). M9 computes NO money: every ₱ figure is the exact source string rendered
 * verbatim (§3.2). Rows are links to the record's detail view (FR-M9-10) and carry
 * `data-search-row-link` so the parent's keyboard nav (arrow/Enter) can walk them.
 * Archived rows wear a grey badge (Rule 10 / OQ1).
 */

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

function StatusChip({ status }: { status: ReceivableStatus }) {
  return (
    <span
      data-testid={`status-chip-${status}`}
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
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

/** Rule 10 — the record is archived in its source module; still findable here. */
function ArchivedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger
        tabIndex={-1}
        render={
          <span
            data-testid="archived-badge"
            className="ml-1.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase align-middle"
          >
            archived
          </span>
        }
      />
      <TooltipContent>This record is archived in its source module.</TooltipContent>
    </Tooltip>
  );
}

/** A whole-row click delegates to the row's own detail link (§6 "whole row clickable"). */
function onRowClick(e: React.MouseEvent<HTMLElement>) {
  const target = e.target as HTMLElement;
  if (target.closest("a")) return; // a real link (the ID cell) handled it natively
  const row = e.currentTarget;
  row.querySelector<HTMLAnchorElement>("a[data-search-row-link]")?.click();
}

const TH = "px-3 py-2.5 font-medium whitespace-nowrap";
const TD = "px-3 py-2.5";
const ROW =
  "border-t hover:bg-muted/40 cursor-pointer focus-within:bg-muted/40";

// --- Deals -----------------------------------------------------------------

function DealsTable({ rows }: { rows: DealSearchRow[] }) {
  return (
    <table className="w-full text-sm" data-testid="search-table">
      <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
        <tr className="text-left">
          <th className={TH}>Deal ID</th>
          <th className={TH}>Date</th>
          <th className={TH}>Transaction</th>
          <th className={TH}>Deal Type</th>
          <th className={TH}>Developer</th>
          <th className={TH}>Client</th>
          <th className={TH}>Property</th>
          <th className={cn(TH, "text-right")}>NET GCI</th>
          <th className={TH}>
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={ROW} data-testid="search-row" data-deal-code={r.dealCode} onClick={onRowClick}>
            <td className={TD}>
              <Link
                href={dealDetailPath(r.dealCode)}
                data-search-row-link
                data-testid="search-row-link"
                className="font-medium text-primary hover:underline"
              >
                {r.dealCode}
              </Link>
              {r.archived && <ArchivedBadge />}
            </td>
            <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatManilaDate(r.bookedDate)}</td>
            <td className={TD}>{TRANSACTION_TYPE_LABELS[r.transactionType]}</td>
            <td className={TD}>{DEAL_TYPE_LABELS[r.dealType]}</td>
            <td className={TD}>{r.developerName ?? "—"}</td>
            <td className={TD}>{r.clientName}</td>
            <td className={cn(TD, "max-w-[16rem] truncate")} title={r.propertyDetails}>{r.propertyDetails}</td>
            <td className={cn(TD, "text-right tabular-nums font-medium")} data-testid="search-net-gci">{formatPHP(r.netGci)}</td>
            <td className={cn(TD, "text-right text-muted-foreground")}><ChevronRight className="size-4" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DealCard({ r }: { r: DealSearchRow }) {
  return (
    <Link
      href={dealDetailPath(r.dealCode)}
      data-search-row-link
      data-testid="search-card"
      data-deal-code={r.dealCode}
      className="block rounded-xl border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-primary">
          {r.dealCode}
          {r.archived && <ArchivedBadge />}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatManilaDate(r.bookedDate)}</span>
      </div>
      <p className="mt-1 truncate text-sm">{r.clientName}</p>
      <p className="mt-2 text-right text-lg font-semibold tabular-nums">{formatPHP(r.netGci)}</p>
    </Link>
  );
}

// --- Payments ---------------------------------------------------------------

function PaymentsTable({ rows }: { rows: PaymentSearchRow[] }) {
  return (
    <table className="w-full text-sm" data-testid="search-table">
      <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
        <tr className="text-left">
          <th className={TH}>Date</th>
          <th className={TH}>Deal ID</th>
          <th className={TH}>Client</th>
          <th className={TH}>Property</th>
          <th className={cn(TH, "text-right")}>Gross</th>
          <th className={cn(TH, "text-right")}>Net of VAT</th>
          <th className={cn(TH, "text-right")}>Net Cash</th>
          <th className={TH}>
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={ROW} data-testid="search-row" data-deal-code={r.dealCode} onClick={onRowClick}>
            <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatManilaDate(r.paymentDate)}</td>
            <td className={TD}>
              <Link
                href={paymentEditPath(r.id)}
                data-search-row-link
                data-testid="search-row-link"
                className="font-medium text-primary hover:underline"
              >
                {r.dealCode}
              </Link>
              {r.archived && <ArchivedBadge />}
            </td>
            <td className={TD}>{r.clientName}</td>
            <td className={cn(TD, "max-w-[16rem] truncate")} title={r.propertyDetails}>{r.propertyDetails}</td>
            <td className={cn(TD, "text-right tabular-nums")} data-testid="search-gross">{formatPHP(r.gross)}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{formatPHP(r.netOfVat)}</td>
            <td className={cn(TD, "text-right tabular-nums font-medium")}>{formatPHP(r.netCash)}</td>
            <td className={cn(TD, "text-right text-muted-foreground")}><ChevronRight className="size-4" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaymentCard({ r }: { r: PaymentSearchRow }) {
  return (
    <Link
      href={paymentEditPath(r.id)}
      data-search-row-link
      data-testid="search-card"
      data-deal-code={r.dealCode}
      className="block rounded-xl border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-primary">
          {r.dealCode}
          {r.archived && <ArchivedBadge />}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatManilaDate(r.paymentDate)}</span>
      </div>
      <p className="mt-1 truncate text-sm">{r.clientName}</p>
      <p className="mt-2 text-right text-lg font-semibold tabular-nums">{formatPHP(r.gross)}</p>
    </Link>
  );
}

// --- Collectibles -----------------------------------------------------------

function CollectiblesTable({ rows }: { rows: CollectibleSearchRow[] }) {
  return (
    <table className="w-full text-sm" data-testid="search-table">
      <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
        <tr className="text-left">
          <th className={TH}>Deal ID</th>
          <th className={TH}>Client</th>
          <th className={TH}>Property</th>
          <th className={TH}>Deal Type</th>
          <th className={cn(TH, "text-right")}>Total Collectible</th>
          <th className={cn(TH, "text-right")}>Collected</th>
          <th className={cn(TH, "text-right")}>Balance</th>
          <th className={TH}>Status</th>
          <th className={TH}>
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={ROW} data-testid="search-row" data-deal-code={r.dealCode} onClick={onRowClick}>
            <td className={TD}>
              <Link
                href={collectibleDetailPath(r.dealCode)}
                data-search-row-link
                data-testid="search-row-link"
                className="font-medium text-primary hover:underline"
              >
                {r.dealCode}
              </Link>
              {r.archived && <ArchivedBadge />}
            </td>
            <td className={TD}>{r.clientName}</td>
            <td className={cn(TD, "max-w-[14rem] truncate")} title={r.propertyDetails}>{r.propertyDetails}</td>
            <td className={TD}>{DEAL_TYPE_LABELS[r.dealType]}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{formatPHP(r.totalCollectible)}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{formatPHP(r.collectedNet)}</td>
            <td className={cn(TD, "text-right tabular-nums font-medium")} data-testid="search-balance">
              {r.balance === null ? <span className="text-muted-foreground">—</span> : formatPHP(r.balance)}
            </td>
            <td className={TD}><StatusChip status={r.status} /></td>
            <td className={cn(TD, "text-right text-muted-foreground")}><ChevronRight className="size-4" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CollectibleCard({ r }: { r: CollectibleSearchRow }) {
  return (
    <Link
      href={collectibleDetailPath(r.dealCode)}
      data-search-row-link
      data-testid="search-card"
      data-deal-code={r.dealCode}
      className="block rounded-xl border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-primary">
          {r.dealCode}
          {r.archived && <ArchivedBadge />}
        </span>
        <StatusChip status={r.status} />
      </div>
      <p className="mt-1 truncate text-sm">{r.clientName}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-xs text-muted-foreground">Balance</span>
        <span className="text-lg font-semibold tabular-nums">
          {r.balance === null ? "—" : formatPHP(r.balance)}
        </span>
      </div>
    </Link>
  );
}

// --- Dispatcher -------------------------------------------------------------

export function SearchResults({ result }: { result: SearchResult }) {
  if (result.source === "deals") {
    const rows = result.rows as DealSearchRow[];
    return (
      <>
        <div className="hidden overflow-x-auto rounded-xl border md:block">
          <DealsTable rows={rows} />
        </div>
        <ul className="space-y-2 md:hidden" data-testid="search-cards">
          {rows.map((r) => (
            <li key={r.id}>
              <DealCard r={r} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (result.source === "payments") {
    const rows = result.rows as PaymentSearchRow[];
    return (
      <>
        <div className="hidden overflow-x-auto rounded-xl border md:block">
          <PaymentsTable rows={rows} />
        </div>
        <ul className="space-y-2 md:hidden" data-testid="search-cards">
          {rows.map((r) => (
            <li key={r.id}>
              <PaymentCard r={r} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  const rows = result.rows as CollectibleSearchRow[];
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <CollectiblesTable rows={rows} />
      </div>
      <ul className="space-y-2 md:hidden" data-testid="search-cards">
        {rows.map((r) => (
          <li key={r.id}>
            <CollectibleCard r={r} />
          </li>
        ))}
      </ul>
    </>
  );
}
