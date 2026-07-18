"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Search, TriangleAlert } from "lucide-react";

import { InputField } from "@/components/affordance/input-field";
import { SelectField } from "@/components/affordance/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatManilaDate } from "@/lib/date/manila";
import { equalsToCentavo, formatPHP, toMoney } from "@/lib/money";
import { dealDetailPath, exportPath, paymentEditPath } from "@/lib/routes";
import { staleBasisExplanation, type CurrentBasis } from "@/lib/payments/stale";
import type { PaymentRow } from "@/lib/payments/queries";

/**
 * The payments list (FR-M5-05, §6.2) — the read side of the daily-use surface. A
 * sticky-header table on the desktop, reflowing to cards at 360 px, both driven by
 * the rows the server RLS-scoped and default-sorted newest-first (rule 18). Filters
 * and pagination run client-side over those rows — 1,000 filter/paginate stays well
 * inside the §8 budget with no second round-trip.
 *
 * Identity columns (deal code, year, developer, client, property) are the JOINED
 * CURRENT deal values — renames propagate; the tax split is the stored snapshot,
 * shown with ₱ right-aligned exact strings (§6.2). A row whose stored `*_used`
 * anchors no longer match the deal + settings today carries a ⚠ stale-basis badge
 * linking to its edit screen for an opt-in recompute (FR-M5-12, §6.4). The pinned
 * totals row sums the FILTERED set at full precision (the stored ::text strings
 * through the Money type), never the rounded displays. Export downloads the current
 * filtered view (AC15).
 */

const PAYMENT_TYPE_LABEL: Record<PaymentRow["payment_type"], string> = {
  commission: "Commission",
  incentive: "Incentive",
};

const MONTH_LABEL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const PAGE_SIZE = 50;

/**
 * Initial filter state seeded from a dashboard drill-down (M6 §6, FR-M6-12) — the
 * Net Cash / Cash & Tax tiles link to `?year=`, a Monthly Cash-In row to
 * `?year=&month=`. Absent → the list's own defaults (all rows).
 */
export type PaymentsInitialFilters = { year?: string; month?: string };

export type PaymentsListProps = {
  payments: readonly PaymentRow[];
  /** The workspace's CURRENT rates — the stale-basis anchors (FR-M5-12). */
  currentRates: { ewt_rate: string; vat_rate: string };
  initialFilters?: PaymentsInitialFilters;
};

/** The current deal + settings a payment's snapshot is compared against. */
function currentBasisOf(
  p: PaymentRow,
  rates: { ewt_rate: string; vat_rate: string }
): CurrentBasis | null {
  if (!p.deal) return null;
  return {
    vat_basis: p.deal.vat_basis,
    ewt_rate: rates.ewt_rate,
    vat_rate: rates.vat_rate,
  };
}

export function PaymentsList({ payments, currentRates, initialFilters }: PaymentsListProps) {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState(initialFilters?.year ?? "all");
  const [month, setMonth] = useState(initialFilters?.month ?? "all");
  const [developer, setDeveloper] = useState("all");
  const [type, setType] = useState<"all" | PaymentRow["payment_type"]>("all");
  const [page, setPage] = useState(1);

  // Hydration marker so e2e waits for the controlled <select>s to be live before
  // firing selectOption (the deals-form pattern — a pre-hydration change is lost).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of payments) if (p.year_paid !== null) set.add(p.year_paid);
    return [...set].sort((a, b) => b - a);
  }, [payments]);

  // Developers present, for the filter — derived from the joined rows, no query.
  const developers = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of payments) {
      const dev = p.deal?.developer;
      if (dev) map.set(dev.id, dev.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [payments]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (year !== "all" && String(p.year_paid) !== year) return false;
      if (month !== "all" && String(p.month_paid) !== month) return false;
      if (type !== "all" && p.payment_type !== type) return false;
      if (developer !== "all") {
        const devId = p.deal?.developer?.id ?? null;
        if (developer === "none" ? devId !== null : devId !== developer) return false;
      }
      if (needle) {
        const hay = `${p.deal?.deal_code ?? ""} ${p.deal?.client_name ?? ""} ${p.deal?.property_details ?? ""} ${p.reference_note ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [payments, search, year, month, type, developer]);

  // Full-precision totals of the FILTERED set (stored strings, never displays).
  const totals = useMemo(() => {
    let gross = toMoney("0");
    let net = toMoney("0");
    let vat = toMoney("0");
    let ewt = toMoney("0");
    let netCash = toMoney("0");
    for (const p of filtered) {
      gross = gross.plus(toMoney(p.gross_amount));
      net = net.plus(toMoney(p.net_of_vat));
      vat = vat.plus(toMoney(p.vat_amount));
      ewt = ewt.plus(toMoney(p.ewt_amount));
      netCash = netCash.plus(toMoney(p.net_cash));
    }
    return {
      gross: gross.toFixed(2),
      net: net.toFixed(2),
      vat: vat.toFixed(2),
      ewt: ewt.toFixed(2),
      netCash: netCash.toFixed(2),
    };
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  useEffect(() => setPage(1), [search, year, month, type, developer]);

  // The download honours the on-screen filters (AC15).
  const exportQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (year !== "all") p.set("year", year);
    if (month !== "all") p.set("month", month);
    if (type !== "all") p.set("type", type);
    if (developer !== "all") p.set("developer", developer);
    if (search.trim()) p.set("q", search.trim());
    const s = p.toString();
    return s ? `&${s}` : "";
  }, [year, month, type, developer, search]);

  return (
    <div className="space-y-4" data-testid="payments-list" data-hydrated={hydrated ? "true" : "false"}>
      {/* toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <label className="text-sm font-medium" htmlFor="pay-search">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <InputField
              id="pay-search"
              affordance="plain"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Deal, client, property or note"
              className="pl-8"
              data-testid="pay-search"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="pay-year">Year paid</label>
          <SelectField
            id="pay-year"
            affordance="plain"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-28"
            options={[
              { value: "all", label: "All years" },
              ...years.map((y) => ({ value: String(y), label: String(y) })),
            ]}
            data-testid="pay-year"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="pay-month">Month</label>
          <SelectField
            id="pay-month"
            affordance="plain"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-36"
            options={[
              { value: "all", label: "All months" },
              ...MONTH_LABEL.map((label, i) => ({ value: String(i + 1), label })),
            ]}
            data-testid="pay-month"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="pay-developer">Developer</label>
          <SelectField
            id="pay-developer"
            affordance="plain"
            value={developer}
            onChange={(e) => setDeveloper(e.target.value)}
            className="w-44"
            options={[
              { value: "all", label: "All developers" },
              { value: "none", label: "Resale / Rental" },
              ...developers.map(([id, name]) => ({ value: id, label: name })),
            ]}
            data-testid="pay-developer"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="pay-type">Type</label>
          <SelectField
            id="pay-type"
            affordance="plain"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-36"
            options={[
              { value: "all", label: "All types" },
              { value: "commission", label: "Commission" },
              { value: "incentive", label: "Incentive" },
            ]}
            data-testid="pay-type"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={`${exportPath("payments", "csv")}${exportQuery}`} />} data-testid="export-csv">
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={`${exportPath("payments", "xlsx")}${exportQuery}`} />} data-testid="export-xlsx">
            <Download className="size-4" /> XLSX
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" data-testid="result-count">
        {filtered.length} {filtered.length === 1 ? "payment" : "payments"}
      </p>

      {/* desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm" data-testid="payment-table">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Date</th>
              <th className="px-3 py-2.5 font-medium">Deal</th>
              <th className="px-3 py-2.5 font-medium">Year</th>
              <th className="px-3 py-2.5 font-medium">Developer</th>
              <th className="px-3 py-2.5 font-medium">Client</th>
              <th className="px-3 py-2.5 font-medium">Property</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 text-right font-medium">Gross</th>
              <th className="px-3 py-2.5 text-right font-medium">Net of VAT</th>
              <th className="px-3 py-2.5 text-right font-medium">VAT</th>
              <th className="px-3 py-2.5 text-right font-medium">EWT</th>
              <th className="px-3 py-2.5 text-right font-medium">Net Cash</th>
              <th className="px-3 py-2.5 font-medium">Note</th>
              <th className="px-3 py-2.5 text-right font-medium">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => (
              <PaymentTableRow key={p.id} p={p} currentRates={currentRates} />
            ))}
          </tbody>
          {/* pinned totals row (filtered set, full precision) */}
          <tfoot className="sticky bottom-0 border-t-2 bg-muted/80 backdrop-blur supports-backdrop-filter:bg-muted/60">
            <tr data-testid="totals-row" className="font-medium">
              <td className="px-3 py-2.5" colSpan={7}>
                Totals ({filtered.length})
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-gross">{formatPHP(totals.gross)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-net">{formatPHP(totals.net)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-vat">{formatPHP(totals.vat)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-ewt">{formatPHP(totals.ewt)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" data-testid="total-net-cash">{formatPHP(totals.netCash)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* mobile cards (§6.5: date, deal label, gross, net cash, type badge) */}
      <ul className="space-y-2 md:hidden" data-testid="payment-cards">
        {pageRows.map((p) => (
          <li key={p.id}>
            <PaymentCard p={p} currentRates={currentRates} />
          </li>
        ))}
        <li className="rounded-xl border bg-muted/40 p-3 text-sm font-medium" data-testid="totals-card">
          <div className="flex justify-between">
            <span>Gross</span>
            <span className="tabular-nums">{formatPHP(totals.gross)}</span>
          </div>
          <div className="flex justify-between">
            <span>Net Cash</span>
            <span className="tabular-nums">{formatPHP(totals.netCash)}</span>
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

/** A zero-tax cell (Rules P2/P3): "untaxed" rather than a bare ₱0.00 (§6.4). */
function TaxCell({ value }: { value: string }) {
  if (equalsToCentavo(value, "0")) {
    return <span className="text-xs text-muted-foreground">untaxed</span>;
  }
  return <span className="tabular-nums text-muted-foreground">{formatPHP(value)}</span>;
}

function StaleBadge({ explanation }: { explanation: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        tabIndex={0}
        className="cursor-help"
        render={
          <span
            data-testid="stale-basis-flag"
            className="inline-flex items-center gap-1 rounded bg-amber-100 px-1 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
          >
            <TriangleAlert className="size-3" /> stale
          </span>
        }
      />
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}

function PaymentTableRow({
  p,
  currentRates,
}: {
  p: PaymentRow;
  currentRates: { ewt_rate: string; vat_rate: string };
}) {
  const basis = currentBasisOf(p, currentRates);
  const stale = basis ? staleBasisExplanation(p, basis) : null;
  return (
    <tr className="border-t hover:bg-muted/40" data-testid="payment-row" data-payment-id={p.id}>
      <td className="px-3 py-2.5 whitespace-nowrap">{formatManilaDate(p.payment_date)}</td>
      <td className="px-3 py-2.5">
        {p.deal ? (
          <Link
            href={dealDetailPath(p.deal.deal_code)}
            className="font-medium text-primary hover:underline"
            data-testid="payment-deal-link"
          >
            {p.deal.deal_code}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {stale && <span className="ml-1.5 align-middle"><StaleBadge explanation={stale} /></span>}
      </td>
      <td className="px-3 py-2.5 tabular-nums">{p.deal?.booked_year ?? "—"}</td>
      <td className="px-3 py-2.5">{p.deal?.developer?.name ?? "—"}</td>
      <td className="px-3 py-2.5">{p.deal?.client_name ?? "—"}</td>
      <td className="px-3 py-2.5 max-w-[16rem] truncate" title={p.deal?.property_details ?? undefined}>
        {p.deal?.property_details ?? "—"}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={p.payment_type === "incentive" ? "secondary" : "outline"} data-testid={`type-badge-${p.payment_type}`}>
          {PAYMENT_TYPE_LABEL[p.payment_type]}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(p.gross_amount)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatPHP(p.net_of_vat)}</td>
      <td className="px-3 py-2.5 text-right"><TaxCell value={p.vat_amount} /></td>
      <td className="px-3 py-2.5 text-right"><TaxCell value={p.ewt_amount} /></td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(p.net_cash)}</td>
      <td className="px-3 py-2.5 text-muted-foreground max-w-[12rem] truncate" title={p.reference_note ?? undefined}>
        {p.reference_note ?? "—"}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Link
          href={paymentEditPath(p.id)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          data-testid="payment-edit-link"
        >
          <Pencil className="size-3.5" /> Edit
        </Link>
      </td>
    </tr>
  );
}

function PaymentCard({
  p,
  currentRates,
}: {
  p: PaymentRow;
  currentRates: { ewt_rate: string; vat_rate: string };
}) {
  const basis = currentBasisOf(p, currentRates);
  const stale = basis ? staleBasisExplanation(p, basis) : null;
  return (
    <Link
      href={paymentEditPath(p.id)}
      className="block rounded-xl border p-3"
      data-testid="payment-card"
      data-payment-id={p.id}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium text-primary">{p.deal?.deal_code ?? "—"}</span>
          <span className="ml-2 truncate text-sm text-muted-foreground">{p.deal?.client_name ?? ""}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {stale && <StaleBadge explanation={stale} />}
          <Badge variant={p.payment_type === "incentive" ? "secondary" : "outline"}>
            {PAYMENT_TYPE_LABEL[p.payment_type]}
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{formatManilaDate(p.payment_date)}</p>
          <p className="text-lg font-semibold tabular-nums">{formatPHP(p.gross_amount)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Net Cash</p>
          <p className="tabular-nums">{formatPHP(p.net_cash)}</p>
        </div>
      </div>
    </Link>
  );
}
