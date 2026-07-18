import { ROUTES } from "@/lib/routes";

/**
 * M8.3 — the five Collection Reports tabs, in the workbook's sheet order
 * (FR-M8-01). Each tab is its own deep-linkable route under `/reports` (the PRD's
 * URL scheme, e.g. `/reports/tax-per-month?year=2026`), so a link lands on the
 * right report with its state and the browser back button walks tabs. This module
 * is PURE (no server-only import), so the client tab-bar and the server pages share
 * one source of truth for the slug ↔ label ↔ path mapping.
 */

export type ReportTabSlug =
  | "cash-per-year"
  | "vintage-matrix"
  | "monthly-cash-flow"
  | "tax-per-month"
  | "booking-year-summary";

export type ReportTab = {
  slug: ReportTabSlug;
  /** Short label for the tab bar. */
  label: string;
  /** Page H1. */
  title: string;
  /** One-line subhead under the title. */
  description: string;
  /**
   * Reports 3 & 4 (monthly-cash-flow, tax-per-month) share ONE selected-year
   * control (rule 3); the other three are all-time. The tab bar carries the active
   * year across these two so switching between them keeps the month view in sync.
   */
  sharedYear: boolean;
};

export const REPORT_TABS: readonly ReportTab[] = [
  {
    slug: "cash-per-year",
    label: "Cash per Year",
    title: "Cash Collected per Year",
    description:
      "All-time cash by the year it was collected — Net of VAT, Net Cash, the VAT you owe and the EWT withheld from you.",
    sharedYear: false,
  },
  {
    slug: "vintage-matrix",
    label: "Vintage Matrix",
    title: "Collection × Booking-Year Matrix",
    description:
      "How long each booking year's commissions take to arrive — cash cross-tabbed by year paid against the year the deal was booked.",
    sharedYear: false,
  },
  {
    slug: "monthly-cash-flow",
    label: "Monthly Cash Flow",
    title: "Monthly Cash Flow",
    description:
      "Cash collected month by month for the selected year — every month shown, zeros included.",
    sharedYear: true,
  },
  {
    slug: "tax-per-month",
    label: "Tax per Month",
    title: "Tax Collected per Month",
    description:
      "The month-by-month tax view you hand your accountant — Output VAT to remit and EWT held as BIR Form 2307 credits.",
    sharedYear: true,
  },
  {
    slug: "booking-year-summary",
    label: "Booking-Year Summary",
    title: "Booking-Year Summary",
    description:
      "Each booking year's earned-vs-collected position — deals, GCI, cash in, and what is still outstanding.",
    sharedYear: false,
  },
] as const;

export const DEFAULT_REPORT_TAB: ReportTabSlug = "cash-per-year";

export function reportTabBySlug(slug: string): ReportTab | undefined {
  return REPORT_TABS.find((t) => t.slug === slug);
}

/**
 * A deep link to a report tab, optionally carrying the shared-year selection
 * (reports 3 & 4) or the matrix value toggle (report 2). Year `undefined`/`"all"`
 * and a missing value both drop the param, keeping default URLs clean.
 */
export function reportPath(
  slug: ReportTabSlug,
  params?: { year?: number | string; value?: "net_of_vat" | "net_cash" }
): string {
  const base = `${ROUTES.reports}/${slug}`;
  const q = new URLSearchParams();
  if (params?.year !== undefined && params.year !== "all" && params.year !== "") {
    q.set("year", String(params.year));
  }
  if (params?.value && params.value !== "net_of_vat") q.set("value", params.value);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
