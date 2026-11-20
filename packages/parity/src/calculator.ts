/**
 * Home loan calculator — FR-T01.
 *
 * CAPTURED AND VERIFIED. See WP-00-behavioural-parity-matrix.md, BPM-001.
 *
 * Source of the rule:
 *   markup  wp_posts ID 293904 (customtemplates, custom-home-loan-template)
 *   logic   wp_postmeta where post_id=293904 AND meta_key='javascript'
 *
 * Verified against production 22 Aug 2026:
 *   income=100000, years=20, rate=7  ->  live ₱3,869,475.19, predicted ₱3,869,475.19, delta 0.00
 *
 * THIS IS P-CLASS PARITY LOGIC. Per PRD GP.1 it is frozen. Do not "improve" the
 * rounding, the affordability constant, or the compounding convention. Any change
 * here alters what a user is told they can borrow and must travel through the
 * Deviation Register (GP.5) first.
 *
 * Three properties of the original that are deliberate, not oversights:
 *   1. The rate is nominal annual divided by 12 — NOT effective compounding.
 *   2. No rounding happens during computation. The value is formatted once, at
 *      the edge. Rounding earlier drifts the displayed figure.
 *   3. Exactly one figure is produced. The current site does not output a monthly
 *      amortisation or an affordability ceiling; adding either is E-class scope.
 */

export type LoanInput = {
  /** Gross monthly income, in pesos. */
  grossMonthlyIncome: number
  /** Loan term in years. The live UI offers 5/10/15/20/25/30 and defaults to 5. */
  loanTermYears: number
  /** Annual interest rate as a percentage, e.g. 7 for 7%. */
  annualInterestRatePct: number
}

export type LoanResult = {
  /** Unrounded. Format at the edge with formatPeso, never before. */
  maxLoanableAmount: number
  /** Intermediate, exposed for the parity suite and for debugging. */
  maxMonthlyPayment: number
  monthlyInterestRate: number
  totalPayments: number
}

/**
 * Share of gross monthly income treated as available for amortisation.
 *
 * Hard-coded as 0.30 in the original. FR-T03 makes this editor-configurable, and
 * the launch value MUST remain exactly 0.30 or a P-class output moves.
 */
export const DEFAULT_INCOME_MULTIPLE = 0.3

export const LOAN_TERM_OPTIONS = [5, 10, 15, 20, 25, 30] as const
export const DEFAULT_LOAN_TERM_YEARS = 5

export function calculateMaxLoan(
  input: LoanInput,
  incomeMultiple: number = DEFAULT_INCOME_MULTIPLE,
): LoanResult {
  const { grossMonthlyIncome, loanTermYears, annualInterestRatePct } = input

  const maxMonthlyPayment = grossMonthlyIncome * incomeMultiple
  const monthlyInterestRate = annualInterestRatePct / 100 / 12
  const totalPayments = loanTermYears * 12

  // Present value of an ordinary annuity, exactly as the original expresses it.
  const maxLoanableAmount =
    (maxMonthlyPayment / monthlyInterestRate) * (1 - Math.pow(1 + monthlyInterestRate, -totalPayments))

  return { maxLoanableAmount, maxMonthlyPayment, monthlyInterestRate, totalPayments }
}

/**
 * Display formatting, reproduced exactly:
 *   toLocaleString('en-US', { style: 'currency', currency: 'PHP' })
 * Grouped thousands, exactly two decimals, ₱ prefix.
 */
export function formatPeso(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })
}

/**
 * The "See Qualified Properties" destination.
 *
 * The `amount` query parameter is a FROZEN URL CONTRACT — the search route must
 * accept it and apply it identically. Note the original passes the *unrounded*
 * value through toFixed(2); it does not pass the formatted string.
 */
export function qualifiedPropertiesUrl(maxLoanableAmount: number, basePath = '/search_results/'): string {
  return `${basePath}?amount=${maxLoanableAmount.toFixed(2)}`
}

/**
 * Validation, as built. Reproduced deliberately, including the gaps.
 *
 * The original requires income and rate but does NOT validate the term, and it
 * handles neither a zero rate (-> NaN, via Infinity * 0) nor a non-numeric rate (-> NaN).
 * `guard` reports those states so the UI can decide what to do without the
 * calculation itself diverging from parity. Any user-visible change to this
 * behaviour is a deviation.
 */
export type LoanGuard = { ok: true } | { ok: false; reason: 'income-required' | 'rate-required' | 'rate-zero' | 'rate-not-numeric' }

export function guard(input: Partial<LoanInput>): LoanGuard {
  if (input.grossMonthlyIncome === undefined || Number.isNaN(input.grossMonthlyIncome)) {
    return { ok: false, reason: 'income-required' }
  }
  if (input.annualInterestRatePct === undefined) return { ok: false, reason: 'rate-required' }
  if (Number.isNaN(input.annualInterestRatePct)) return { ok: false, reason: 'rate-not-numeric' }
  if (input.annualInterestRatePct === 0) return { ok: false, reason: 'rate-zero' }
  return { ok: true }
}
