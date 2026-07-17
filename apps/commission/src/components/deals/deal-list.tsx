"use client";

import * as React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Plus, Search } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { SelectField } from "@/components/affordance/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatManilaDate } from "@/lib/date/manila";
import { formatPHP, formatYield, toMoney } from "@/lib/money";
import { dealDetailPath, exportPath, ROUTES } from "@/lib/routes";
import { DEAL_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/deals/labels";
import type { Deal } from "@/types/entities";

/**
 * The deal list (FR-M1-02, FR-M1-09, FR-M1-12): sticky-header table on the
 * desktop, reflowing cards at 360 px. Money columns are right-aligned and
 * tabular so decimals line up; the computed columns are visually distinct.
 *
 * Sorting, searching, the year filter, the column chooser, the archived toggle
 * and pagination all run client-side over the rows the server already scoped by
 * RLS — 1,000 rows filter and sort in well under the §8 budget without a second
 * round-trip. The export button downloads the current filtered view.
 */

type Align = "start" | "end";
type ColumnKey =
  | "deal_code"
  | "booked_date"
  | "client"
  | "property"
  | "type"
  | "list_price"
  | "net_list_price"
  | "gci"
  | "incentive_net"
  | "referral_out"
  | "net_gci"
  | "vat_memo"
  | "ewt_memo"
  | "yield"
  | "year";

type Column = {
  key: ColumnKey;
  header: string;
  align: Align;
  /** Computed columns wear the locked tint to read differently from inputs. */
  computed?: boolean;
  defaultOn: boolean;
  render: (deal: Deal) => React.ReactNode;
  sortValue: (deal: Deal) => string | number;
};

function typeLabel(deal: Deal): string {
  const txn = TRANSACTION_TYPE_LABELS[deal.transaction_type];
  return deal.deal_type === "n_a" ? txn : `${txn} · ${DEAL_TYPE_LABELS[deal.deal_type]}`;
}

const COLUMNS: readonly Column[] = [
  { key: "deal_code", header: "Code", align: "start", defaultOn: true, render: (d) => d.deal_code, sortValue: (d) => d.deal_code },
  { key: "booked_date", header: "Date", align: "start", defaultOn: true, render: (d) => formatManilaDate(d.booked_date), sortValue: (d) => d.booked_date },
  { key: "client", header: "Client", align: "start", defaultOn: true, render: (d) => d.client_name, sortValue: (d) => d.client_name.toLowerCase() },
  { key: "property", header: "Property", align: "start", defaultOn: true, render: (d) => d.property_details, sortValue: (d) => d.property_details.toLowerCase() },
  { key: "type", header: "Type", align: "start", defaultOn: true, render: typeLabel, sortValue: typeLabel },
  { key: "list_price", header: "List Price", align: "end", defaultOn: true, render: (d) => formatPHP(d.list_price), sortValue: (d) => moneyKey(d.list_price) },
  { key: "net_list_price", header: "Net List", align: "end", computed: true, defaultOn: false, render: (d) => formatPHP(d.net_list_price), sortValue: (d) => moneyKey(d.net_list_price) },
  { key: "gci", header: "GCI", align: "end", computed: true, defaultOn: false, render: (d) => formatPHP(d.gci_net_of_vat), sortValue: (d) => moneyKey(d.gci_net_of_vat) },
  { key: "incentive_net", header: "Incentive", align: "end", computed: true, defaultOn: false, render: (d) => formatPHP(d.incentive_net), sortValue: (d) => moneyKey(d.incentive_net) },
  { key: "referral_out", header: "Referral Out", align: "end", computed: true, defaultOn: false, render: (d) => formatPHP(d.referral_out), sortValue: (d) => moneyKey(d.referral_out) },
  { key: "net_gci", header: "NET GCI", align: "end", computed: true, defaultOn: true, render: (d) => formatPHP(d.net_gci), sortValue: (d) => moneyKey(d.net_gci) },
  { key: "vat_memo", header: "VAT (memo)", align: "end", computed: true, defaultOn: false, render: (d) => formatPHP(d.vat_memo), sortValue: (d) => moneyKey(d.vat_memo) },
  { key: "ewt_memo", header: "EWT (memo)", align: "end", computed: true, defaultOn: false, render: (d) => formatPHP(d.ewt_memo), sortValue: (d) => moneyKey(d.ewt_memo) },
  { key: "yield", header: "Yield", align: "end", computed: true, defaultOn: false, render: (d) => formatYield(d.yield_on_list), sortValue: (d) => Number(d.yield_on_list) },
  { key: "year", header: "Year", align: "end", defaultOn: false, render: (d) => d.booked_year, sortValue: (d) => d.booked_year },
];

/** A numeric sort key for a money string, exact enough to order 1,000 rows. */
function moneyKey(value: string): number {
  return toMoney(value).toNumber();
}

const PAGE_SIZE = 50;

export function DealList({ deals }: { deals: readonly Deal[] }) {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: "asc" | "desc" }>({
    key: "booked_date",
    dir: "desc",
  });
  const [visible, setVisible] = useState<Set<ColumnKey>>(
    () => new Set(COLUMNS.filter((c) => c.defaultOn).map((c) => c.key))
  );
  const [page, setPage] = useState(1);
  const [chooserOpen, setChooserOpen] = useState(false);

  const years = useMemo(
    () => Array.from(new Set(deals.map((d) => d.booked_year))).sort((a, b) => b - a),
    [deals]
  );

  const columns = COLUMNS.filter((c) => visible.has(c.key));

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = deals.filter((d) => {
      if (!showArchived && d.archived_at) return false;
      if (showArchived && !d.archived_at) return false;
      if (year !== "all" && String(d.booked_year) !== year) return false;
      if (needle) {
        const hay = `${d.deal_code} ${d.client_name} ${d.property_details}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const col = COLUMNS.find((c) => c.key === sort.key);
    if (col) {
      rows.sort((a, b) => {
        const av = col.sortValue(a);
        const bv = col.sortValue(b);
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [deals, search, year, showArchived, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  // Reset to page 1 whenever the filtered set changes shape.
  React.useEffect(() => setPage(1), [search, year, showArchived]);

  const toggleSort = (key: ColumnKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );

  const toggleColumn = (key: ColumnKey) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const exportQuery =
    (year !== "all" ? `&year=${year}` : "") + (showArchived ? "&archived=true" : "");

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="deal-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <InputField
              id="deal-search"
              affordance="plain"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, client or property"
              className="pl-8"
              data-testid="deal-search"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deal-year">Year</Label>
          <SelectField
            id="deal-year"
            affordance="plain"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-32"
            options={[
              { value: "all", label: "All years" },
              ...years.map((y) => ({ value: String(y), label: String(y) })),
            ]}
            data-testid="deal-year"
          />
        </div>

        <div className="relative space-y-1.5">
          <span className="sr-only">Columns</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => setChooserOpen((o) => !o)}
            data-testid="column-chooser-toggle"
          >
            <ChevronsUpDown className="size-4" /> Columns
          </Button>
          {chooserOpen && (
            <div
              className="absolute right-0 z-20 mt-1 w-52 space-y-1.5 rounded-lg border bg-popover p-3 shadow-lg"
              data-testid="column-chooser"
            >
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={visible.has(c.key)}
                    onCheckedChange={() => toggleColumn(c.key)}
                    disabled={c.key === "deal_code"}
                    data-testid={`column-toggle-${c.key}`}
                  />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={`${exportPath("deals", "csv")}${exportQuery}`} />} data-testid="export-csv">
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={`${exportPath("deals", "xlsx")}${exportQuery}`} />} data-testid="export-xlsx">
            <Download className="size-4" /> XLSX
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showArchived}
            onCheckedChange={(v) => setShowArchived(v === true)}
            data-testid="archived-toggle"
          />
          Show archived
        </label>
        <p className="text-sm text-muted-foreground" data-testid="result-count">
          {filtered.length} {filtered.length === 1 ? "deal" : "deals"}
          {year !== "all" ? ` in ${year}` : ""}
        </p>
      </div>

      {/* desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm" data-testid="deal-table">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2.5 font-medium whitespace-nowrap ${c.align === "end" ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    data-testid={`sort-${c.key}`}
                  >
                    {c.header}
                    {sort.key === c.key &&
                      (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((deal) => (
              <tr
                key={deal.id}
                className="border-t hover:bg-muted/40 data-[archived=true]:opacity-60"
                data-archived={deal.archived_at ? "true" : undefined}
                data-testid="deal-row"
                data-code={deal.deal_code}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 whitespace-nowrap ${c.align === "end" ? "text-right tabular-nums" : "text-left"} ${c.computed ? "text-foreground" : ""}`}
                  >
                    {c.key === "deal_code" ? (
                      <Link
                        href={dealDetailPath(deal.deal_code)}
                        className="font-medium text-primary hover:underline"
                        data-testid="deal-link"
                      >
                        {deal.deal_code}
                      </Link>
                    ) : (
                      c.render(deal)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="space-y-2 md:hidden" data-testid="deal-cards">
        {pageRows.map((deal) => (
          <li key={deal.id}>
            <Link
              href={dealDetailPath(deal.deal_code)}
              className="block rounded-xl border p-3 data-[archived=true]:opacity-60"
              data-archived={deal.archived_at ? "true" : undefined}
              data-testid="deal-card"
              data-code={deal.deal_code}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{deal.deal_code}</span>
                <span className="tabular-nums font-medium">{formatPHP(deal.net_gci)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate">{deal.client_name}</span>
                <span>{formatManilaDate(deal.booked_date)}</span>
              </div>
              {deal.archived_at && (
                <Badge variant="secondary" className="mt-2">Archived</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground" data-testid="no-results">
          No deals match your filters.
        </p>
      )}

      {/* pagination */}
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
          <span className="text-sm text-muted-foreground" data-testid="page-status">
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

      <div className="md:hidden">
        <Button
          className="w-full"
          nativeButton={false}
          render={<Link href={ROUTES.dealNew} />}
        >
          <Plus className="size-4" /> Log a deal
        </Button>
      </div>
    </div>
  );
}
