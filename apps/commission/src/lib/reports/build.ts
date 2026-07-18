import { toMoney, ZERO, type MoneyValue } from "@/lib/money";

/**
 * M8.1 — the payment-period Collection Reports (reports 1, 3, 4), as PURE functions
 * over the payment rows the read layer already loaded. No database, no `today`, no
 * formatting — so every figure is unit-testable against the v30.20 workbook anchors
 * and the FR-M8-14 cross-checks are assertable in CI.
 *
 * THE SNAPSHOT DOCTRINE (§3.1 / rule 5). Reports 1/3/4 aggregate the STORED payment
 * split (net_of_vat/vat/ewt/net_cash) — a statement of what actually happened at
 * collection time. They never dereference the deal for money, so a later deal edit
 * or rate change can never restate historical cash/tax (unlike the sheet's live
 * formulas). The one place a deal IS read here is the year RANGE: report 1's rows
 * span the union of paid AND booked years (rule 2), so a booked-2024/collected-
 * nothing year shows as a visible zero row, not a gap. That range is a live read of
 * the current booked years — no money crosses it.
 *
 * TWO YEAR SEMANTICS (rule 1). Reports 1/3/4 group by **Year (paid)** =
 * year(payment.paid_date). The booking year only ever feeds the range union here;
 * it groups report 5 and the matrix columns (M8.2), never these three.
 *
 * MONEY DISCIPLINE (§4 rule 13 / Master PRD §4.3). Every peso figure is summed at
 * FULL precision through the Money decimal type from its stored ::text string and
 * rounded to centavos once (`toFixed(2)`); a TOTAL is the decimal sum of the same
 * payment set, never a re-sum of the display-rounded rows — so a TOTAL ties to its
 * rows to the centavo. NO tax math lives here: these are sums of figures M1's engine
 * already computed and M5 stored.
 *
 * RELATIONSHIP TO M6 SECTION 6 (dashboard buildMonthly). Report 3 is semantically
 * M6's Monthly Cash-In minus the cumulative/target columns (which belong to the
 * dashboard's pace story, not a cash-flow report); report 4 is the same month frame
 * over the tax columns. The shared month-frame walk (all 12 months, zeros filled,
 * rule 4) is `buildMonthFrame` below — kept here rather than reaching into the
 * dashboard so reports carry no target/pace coupling.
 */

// --- shared helpers ----------------------------------------------------------

/** Full-precision sum of a money accessor over rows, rounded to centavos once. */
function sumMoney<T>(rows: readonly T[], get: (row: T) => string | null): string {
  return rows
    .reduce<MoneyValue>((acc, row) => {
      const v = get(row);
      return v === null ? acc : acc.plus(toMoney(v));
    }, ZERO)
    .toFixed(2);
}

// --- the payment shape reports 1/3/4 read -----------------------------------

/**
 * The minimal payment projection these reports consume — every money field a stored
 * ::text string, the period fields M5's generated year_paid/month_paid. A full M5
 * PaymentRow satisfies it; a test builds a partial. Only ACTIVE (non-archived)
 * payments are passed in — the server loader filters them (rule 12).
 */
export type ReportPayment = {
  /** Σ target for report 3, and report 4's "base" column — col K (Net of VAT). */
  net_of_vat: string;
  /** Col N — what lands in the bank (gross − ewt). */
  net_cash: string;
  /** Col L — Output VAT to remit (report 1 + report 4). */
  vat_amount: string;
  /** Col M — EWT withheld, the 2307 credit (report 1 + report 4). */
  ewt_amount: string;
  /**
   * Calendar year the cash moved — M5's generated year_paid. Typed nullable to match
   * the generated column (generated-always-stored from NOT NULL payment_date, so
   * never null in practice); a null matches no year and is dropped from the range.
   */
  year_paid: number | null;
  /** Calendar month 1–12 the cash moved — M5's generated month_paid (see year_paid). */
  month_paid: number | null;
};

// --- rule 2: the derived contiguous year range ------------------------------

/**
 * Rule 2 — the contiguous year range for report 1 (and the shared year selector):
 * every integer from min to max of the given years, inclusive, so a year inside the
 * span with no data appears as a zero row rather than a gap (the gap is the story —
 * booked-2024 / collected-nothing-until-2026 must be visible). Callers pass the
 * UNION of paid years (report 1's own data) and booked years (so a booking with no
 * cash still extends the range). Empty input → empty range (the empty-workspace
 * shape, rule 14). Nulls are ignored (a payment_date is never null in practice).
 */
export function contiguousYearRange(years: readonly (number | null)[]): number[] {
  const present = years.filter((y): y is number => y !== null && Number.isInteger(y));
  if (present.length === 0) return [];
  const min = Math.min(...present);
  const max = Math.max(...present);
  const range: number[] = [];
  for (let y = min; y <= max; y += 1) range.push(y);
  return range;
}

/**
 * Rule 4 — the 12-month frame. Walks month 1…12 in order (always all twelve,
 * calendar month, day-count irrelevant) and builds a row per month from the
 * payments that fall in it. `inYear` is already filtered to the selected year.
 */
function buildMonthFrame<T>(
  inYear: readonly ReportPayment[],
  make: (ofMonth: readonly ReportPayment[], month: number) => T
): T[] {
  const rows: T[] = [];
  for (let month = 1; month <= 12; month += 1) {
    rows.push(make(inYear.filter((p) => p.month_paid === month), month));
  }
  return rows;
}

/** Only payments with a resolvable paid year take part (defensive; never null live). */
function withPaidYear(payments: readonly ReportPayment[]): ReportPayment[] {
  return payments.filter((p) => p.year_paid !== null);
}

// --- Report 1 — Cash Collected per Year (all-time) --------------------------

/** One paid-year row of report 1 (§3.2). */
export type CashPerYearRow = {
  /** The paid year `y`. */
  year: number;
  /** Σ net_of_vat where year(paid) = y. */
  netOfVat: string;
  /** Σ net_cash where year(paid) = y. */
  netCash: string;
  /** Σ vat where year(paid) = y — Output VAT. */
  outputVat: string;
  /** Σ ewt where year(paid) = y. */
  ewt: string;
  /** count(p) where year(paid) = y. */
  payments: number;
};

/** Report 1's TOTAL row — the same measures over every paid year (no `year`). */
export type CashPerYearTotal = Omit<CashPerYearRow, "year">;

export type CashPerYearReport = {
  /** One row per year in the rule-2 range (zeros where no cash), ascending. */
  rows: CashPerYearRow[];
  /** The pinned TOTAL — decimal sum of the rows to the centavo (rule 13). */
  total: CashPerYearTotal;
};

/**
 * Report 1 (§3.2) — Cash Collected per Year over the whole workspace. Rows span the
 * contiguous union of paid + booked years (rule 2); each is the per-year sum of the
 * stored splits, with the payment count. The TOTAL sums the full payment set (not
 * the rows), so it ties to Σ rows to the centavo.
 */
export function buildCashPerYear(
  payments: readonly ReportPayment[],
  bookedYears: readonly number[]
): CashPerYearReport {
  const scoped = withPaidYear(payments);
  const range = contiguousYearRange([
    ...scoped.map((p) => p.year_paid),
    ...bookedYears,
  ]);

  const rows: CashPerYearRow[] = range.map((year) => {
    const of = scoped.filter((p) => p.year_paid === year);
    return {
      year,
      netOfVat: sumMoney(of, (p) => p.net_of_vat),
      netCash: sumMoney(of, (p) => p.net_cash),
      outputVat: sumMoney(of, (p) => p.vat_amount),
      ewt: sumMoney(of, (p) => p.ewt_amount),
      payments: of.length,
    };
  });

  return {
    rows,
    total: {
      netOfVat: sumMoney(scoped, (p) => p.net_of_vat),
      netCash: sumMoney(scoped, (p) => p.net_cash),
      outputVat: sumMoney(scoped, (p) => p.vat_amount),
      ewt: sumMoney(scoped, (p) => p.ewt_amount),
      payments: scoped.length,
    },
  };
}

// --- Report 3 — Monthly Cash Flow (selected year) ---------------------------

/** One month row of report 3 (§3.4). */
export type MonthlyCashFlowRow = {
  /** 1–12. */
  month: number;
  /** Σ net_of_vat in (Y, month). */
  netOfVat: string;
  /** Σ net_cash in (Y, month). */
  netCash: string;
};

export type MonthlyCashFlowReport = {
  /** The selected paid year Y. */
  year: number;
  /** Always twelve rows (Jan–Dec), zeros where empty (rule 4). */
  rows: MonthlyCashFlowRow[];
  /** The TOTAL — decimal sum of the twelve rows to the centavo. */
  total: Omit<MonthlyCashFlowRow, "month">;
};

/**
 * Report 3 (§3.4) — Monthly Cash Flow for the selected paid year Y: net of VAT and
 * net cash per month, all twelve months present (rule 4). December's cumulative in
 * M6 reconciles to this TOTAL; here the report carries no cumulative/target columns.
 */
export function buildMonthlyCashFlow(
  payments: readonly ReportPayment[],
  year: number
): MonthlyCashFlowReport {
  const inYear = withPaidYear(payments).filter((p) => p.year_paid === year);

  const rows = buildMonthFrame(inYear, (ofMonth, month) => ({
    month,
    netOfVat: sumMoney(ofMonth, (p) => p.net_of_vat),
    netCash: sumMoney(ofMonth, (p) => p.net_cash),
  }));

  return {
    year,
    rows,
    total: {
      netOfVat: sumMoney(inYear, (p) => p.net_of_vat),
      netCash: sumMoney(inYear, (p) => p.net_cash),
    },
  };
}

// --- Report 4 — Tax Collected per Month (selected year) ---------------------

/** One month row of report 4 (§3.5) — the accountant's monthly hand-off. */
export type TaxPerMonthRow = {
  /** 1–12. */
  month: number;
  /** Σ vat — Output VAT to remit to BIR. */
  outputVat: string;
  /** Σ ewt — EWT withheld, the creditable Form 2307 amount. */
  ewt: string;
  /** Σ net_of_vat — the income base the taxes were computed on. */
  netOfVatBase: string;
  /** count(p) — volume sanity check against the OR/invoice file. */
  payments: number;
};

export type TaxPerMonthReport = {
  /** The selected paid year Y. */
  year: number;
  /** Always twelve rows (Jan–Dec), zeros where empty (rule 4). */
  rows: TaxPerMonthRow[];
  /** The TOTAL — decimal sum of the twelve rows to the centavo. */
  total: Omit<TaxPerMonthRow, "month">;
};

/**
 * Report 4 (§3.5) — Tax Collected per Month for the selected paid year Y: Output VAT
 * to remit, EWT withheld (2307 credit), the Net-of-VAT base, and the payment count,
 * per month, all twelve present. Shares report 3's selected-year filter (rule 3). A
 * cash-basis view (grouped by date received) — the accountant's input, not a return.
 */
export function buildTaxPerMonth(
  payments: readonly ReportPayment[],
  year: number
): TaxPerMonthReport {
  const inYear = withPaidYear(payments).filter((p) => p.year_paid === year);

  const rows = buildMonthFrame(inYear, (ofMonth, month) => ({
    month,
    outputVat: sumMoney(ofMonth, (p) => p.vat_amount),
    ewt: sumMoney(ofMonth, (p) => p.ewt_amount),
    netOfVatBase: sumMoney(ofMonth, (p) => p.net_of_vat),
    payments: ofMonth.length,
  }));

  return {
    year,
    rows,
    total: {
      outputVat: sumMoney(inYear, (p) => p.vat_amount),
      ewt: sumMoney(inYear, (p) => p.ewt_amount),
      netOfVatBase: sumMoney(inYear, (p) => p.net_of_vat),
      payments: inYear.length,
    },
  };
}
