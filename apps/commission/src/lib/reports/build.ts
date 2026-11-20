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

// --- Report 2 — Collection × Booking-Year Matrix (vintage; all-time) ---------

/**
 * The verbatim reading-guide caption (§3.3 / FR-M8-03). Exported so the M8.3 matrix
 * component and the export writer share one source of truth rather than each
 * restating it — a caption drift here would be a spec violation.
 */
export const VINTAGE_MATRIX_CAPTION =
  "Diagonal = collected in the year booked · below diagonal = pre-selling collection tail.";

/** The matrix value toggle (§3.3 / FR-M8-04) — Net of VAT is the default. */
export type MatrixValue = "net_of_vat" | "net_cash";

/**
 * The payment shape the vintage matrix reads: the two toggle-able money columns, the
 * paid year (the row axis), and the deal's CURRENT `booked_year` (the column axis) —
 * the FIRST place a payment→deal join carries money attribution. That join is LIVE,
 * not a snapshot (rule 6): correcting a deal's mis-entered booked date re-vintages its
 * payments into the right column, while the money splits stay frozen (rule 5). The
 * query layer flattens PaymentRow.deal.booked_year onto the row; a full PaymentRow
 * with its deal joined satisfies this once flattened.
 *
 * `booked_year` is typed nullable ONLY to model the dangling-reference failure
 * (rule 15): M5 rejects payments against nonexistent deals, so every payment reaching
 * M8 has a resolvable booked_year — but if a dangling row ever appears, the builder
 * fails loudly (throws) rather than silently dropping the cash from the matrix.
 */
export type MatrixPayment = {
  /** Col K — the Net of VAT toggle value. */
  net_of_vat: string;
  /** Col N — the Net Cash toggle value. */
  net_cash: string;
  /** Calendar year the cash moved — the matrix ROW axis (M5's generated year_paid). */
  year_paid: number | null;
  /** The deal's current booking year — the matrix COLUMN axis (live join, rule 6). */
  booked_year: number | null;
};

/** One paid-year row of the matrix: a cell per booking-year column + the row total. */
export type VintageMatrixRow = {
  /** The paid year `y_paid` (the row's fixed axis value). */
  yearPaid: number;
  /**
   * One cell per booking-year column, index-aligned with `bookedYears`. Zero cells
   * are "0.00" (exports carry the zero; the M8.3 grid renders `—`). A cell where
   * `yearPaid < bookedYear` (above the diagonal — paid before booking) is rendered
   * as-is, never hidden (rule 9); flagging that anomaly is M6's job, not M8's.
   */
  cells: string[];
  /**
   * Σ over every booking-year column for this paid year — equals report 1's column
   * for the same toggle value (FR-M8-14: matrix row total ≡ report 1 per-year).
   */
  total: string;
};

export type VintageMatrix = {
  /** The active toggle (§3.3 default Net of VAT) — labelled on screen and in exports. */
  value: MatrixValue;
  /** The row axis: contiguous paid years (rule 2). A paid-but-unbooked year is a row. */
  paidYears: number[];
  /**
   * The column axis: contiguous booking years across all active deals (rule 2). A
   * booked-but-uncollected year is a column with an all-zero body (AC8); a paid year
   * with no booking does NOT add a column (columns span booking years only, rule 8 /
   * AC7).
   */
  bookedYears: number[];
  /** One row per paid year, ascending. */
  rows: VintageMatrixRow[];
  /** Σ per booking-year column, index-aligned with `bookedYears` (the TOTAL row). */
  columnTotals: string[];
  /** Σ over the whole matrix — the TOTAL row's corner; ties to report 1's TOTAL. */
  grandTotal: string;
};

/** The money accessor for the active toggle value. */
function matrixAccessor(value: MatrixValue): (p: MatrixPayment) => string {
  return value === "net_cash" ? (p) => p.net_cash : (p) => p.net_of_vat;
}

/**
 * Report 2 (§3.3 / FR-M8-03/04) — the paid-year × booking-year vintage matrix. Rows
 * span the contiguous paid-year range (from the payments); columns span the contiguous
 * booking-year range (from ALL active deals, so a booked-but-uncollected year still
 * shows a column — AC8). Each cell is Σ of the toggle value over payments whose
 * year_paid = the row AND deal.booked_year = the column; the row total equals report
 * 1's per-year figure for the same value (the FR-M8-14 cross-check). The TOTAL is the
 * decimal sum of the same payment set, never a re-sum of display-rounded cells.
 *
 * DANGLING REFERENCE (rule 15): a payment whose deal cannot resolve a booking year
 * throws — M8 must fail loudly, never silently drop a row of real cash from the vintage
 * picture. `bookedYears` is the column-axis source (the active deals' booking years);
 * passing the deals' years, not the payments' joined years, is what lets a zero-payment
 * booking year still be a column.
 */
export function buildVintageMatrix(
  payments: readonly MatrixPayment[],
  bookedYears: readonly number[],
  value: MatrixValue = "net_of_vat"
): VintageMatrix {
  const scoped = payments.filter((p) => p.year_paid !== null);

  // Rule 15 — a payment reaching the matrix with no resolvable booking year is a
  // dangling reference; surface it loudly rather than dropping the cash.
  for (const p of scoped) {
    if (p.booked_year === null) {
      throw new Error(
        "A payment references a deal with no booking year — the vintage matrix cannot attribute it. This is a dangling reference (rule 15); it must be fixed upstream, never silently dropped."
      );
    }
  }

  const get = matrixAccessor(value);
  const paidYears = contiguousYearRange(scoped.map((p) => p.year_paid));
  const bookedAxis = contiguousYearRange(bookedYears);

  const rows: VintageMatrixRow[] = paidYears.map((yearPaid) => {
    const inRow = scoped.filter((p) => p.year_paid === yearPaid);
    return {
      yearPaid,
      cells: bookedAxis.map((yearBooked) =>
        sumMoney(inRow.filter((p) => p.booked_year === yearBooked), get)
      ),
      total: sumMoney(inRow, get),
    };
  });

  return {
    value,
    paidYears,
    bookedYears: bookedAxis,
    rows,
    columnTotals: bookedAxis.map((yearBooked) =>
      sumMoney(scoped.filter((p) => p.booked_year === yearBooked), get)
    ),
    grandTotal: sumMoney(scoped, get),
  };
}

// --- Report 5 — Booking-Year Summary (all-time) -----------------------------

/**
 * The receivable shape report 5 reads (§3.6) — booked year, status, and the earned/
 * collected/outstanding money the M4 engine already computed. A full M4 ReceivableRow
 * satisfies it; only ACTIVE (non-archived) receivables are passed in (the M1 cascade-
 * archive contract, rule 12). Reads deals+receivables, NOT payments — the one report
 * whose money never touches the payment ledger.
 */
export type ReportReceivable = {
  /** The deal's booking year — report 5's row grouping (live, rule 6). */
  booked_year: number;
  /** Open rows feed Outstanding; Cancelled rows feed Written-off (OQ4 split). */
  status: "open" | "closed" | "cancelled";
  /** Σ = report 5's GCI (Net of VAT) column — equals Σ deal.net_gci (M4 mirrors it). */
  booked_net_gci: string;
  /** Σ payment net_of_vat for the deal — report 5's Collected column. */
  collected_net: string;
  /** Total Collectible − Collected — summed (signed, rule 11) over OPEN rows. */
  balance: string | null;
  /** The Cancelled deal's written-off balance (Rule O) — the OQ4 split column. */
  written_off: string | null;
};

/** One booking-year row of report 5 (§3.6). */
export type BookingYearSummaryRow = {
  /** The booking year `B`. */
  year: number;
  /** count(receivables where booked_year = B) — every deal, all statuses. */
  deals: number;
  /** Σ booked_net_gci where booked_year = B — GCI (Net of VAT). */
  gci: string;
  /** Σ collected_net where booked_year = B. */
  collected: string;
  /**
   * Σ balance over OPEN rows where booked_year = B (signed, rule 11). OQ4 DEFAULT
   * (master PRD Q18 = "Split, flagged as sheet departure"): open balances ONLY —
   * Cancelled deals' written-off amounts are split out into `writtenOff` below rather
   * than lumped in here as the v30.20 sheet does. This changes the sheet's Outstanding
   * on any workspace carrying Cancelled deals; it matches M6's position block, which
   * reports written-off separately. The workbook fixture has no Cancelled deals, so
   * Outstanding is identical to the sheet there (₱4,855,304.39).
   */
  outstanding: string;
  /**
   * Σ written_off over CANCELLED rows where booked_year = B (the OQ4 split column).
   * Zero unless the workspace has Cancelled deals in that booking year.
   */
  writtenOff: string;
};

/** Report 5's TOTAL row — the same measures over every booking year (no `year`). */
export type BookingYearSummaryTotal = Omit<BookingYearSummaryRow, "year">;

export type BookingYearSummaryReport = {
  /** One row per year in the rule-2 union range (zeros where no deals), ascending. */
  rows: BookingYearSummaryRow[];
  /** The pinned TOTAL — decimal sum of the rows to the centavo (rule 13). */
  total: BookingYearSummaryTotal;
};

/** The report-5 measures over an arbitrary receivable set (a row body or the TOTAL). */
function summariseReceivables(
  group: readonly ReportReceivable[]
): Omit<BookingYearSummaryRow, "year"> {
  return {
    deals: group.length,
    gci: sumMoney(group, (r) => r.booked_net_gci),
    collected: sumMoney(group, (r) => r.collected_net),
    // Rule 11 — sum OPEN balances signed, as-is (an overpaid open deal's negative
    // balance nets in; it is never clamped). Cancelled balances are NOT here (OQ4).
    outstanding: sumMoney(
      group.filter((r) => r.status === "open"),
      (r) => r.balance
    ),
    writtenOff: sumMoney(
      group.filter((r) => r.status === "cancelled"),
      (r) => r.written_off
    ),
  };
}

/**
 * Report 5 (§3.6 / FR-M8-08) — the Booking-Year Summary over deals + receivables.
 * Rows span the contiguous UNION of booked years (the receivables) and paid years
 * (the payments) — rule 2: a booking year with no cash is a zero-money row (AC8), and
 * a paid year with no booking is a row with Deals 0 and all-zero money (AC7). Each row
 * counts deals and sums GCI / Collected / Outstanding / Written-off; the TOTAL sums
 * the whole set at full precision, so its Collected ties to report 1's all-years
 * Net-of-VAT TOTAL (FR-M8-14) and every column ties to Σ rows to the centavo (rule
 * 13). `paidYears` is the range-union input only — no payment money is read here
 * (report 5 reads receivables, never the payment ledger).
 */
export function buildBookingYearSummary(
  receivables: readonly ReportReceivable[],
  paidYears: readonly (number | null)[]
): BookingYearSummaryReport {
  const range = contiguousYearRange([
    ...receivables.map((r) => r.booked_year),
    ...paidYears,
  ]);

  const rows: BookingYearSummaryRow[] = range.map((year) => ({
    year,
    ...summariseReceivables(receivables.filter((r) => r.booked_year === year)),
  }));

  return { rows, total: summariseReceivables(receivables) };
}
