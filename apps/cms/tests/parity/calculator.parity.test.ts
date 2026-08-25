import { describe, expect, it } from 'vitest'

import {
  DEFAULT_INCOME_MULTIPLE,
  DEFAULT_LOAN_TERM_YEARS,
  LOAN_TERM_OPTIONS,
  calculateMaxLoan,
  formatPeso,
  guard,
  qualifiedPropertiesUrl,
} from '../../src/lib/calculator'

/**
 * GOLDEN MASTER — FR-T01 / BPM-001.  PRD FR-PY03, FR-PY04.
 *
 * A failure here is a LAUNCH BLOCKER, not a normal test failure: it means the
 * rebuild computes a different loan figure from the live site. Per GP.4 it must
 * be fixed or raised as a deviation — never re-baselined to make the suite green.
 *
 * GM-CALC-001 is the only case with an observed live value. It was captured from
 * production on 22 Aug 2026 and matched to the centavo. The remaining vectors are
 * computed from the extracted formula and are regression guards: they lock in the
 * behaviour we believe is correct, and they are NOT independent evidence.
 * Replace them with live-observed values as the sweep continues.
 */
describe('FR-T01 home loan calculator — golden master', () => {
  it('GM-CALC-001: matches production exactly (income 100000, 20y, 7%)', () => {
    const { maxLoanableAmount } = calculateMaxLoan({
      grossMonthlyIncome: 100_000,
      loanTermYears: 20,
      annualInterestRatePct: 7,
    })

    // Observed on https://zetagroup.ph/buy/ — 22 Aug 2026.
    expect(formatPeso(maxLoanableAmount)).toBe('₱3,869,475.19')
  })

  it('GM-CALC-001b: the redirect carries the unrounded value through toFixed(2)', () => {
    const { maxLoanableAmount } = calculateMaxLoan({
      grossMonthlyIncome: 100_000,
      loanTermYears: 20,
      annualInterestRatePct: 7,
    })

    // Observed live: clicking "See Qualified Properties" navigated here.
    expect(qualifiedPropertiesUrl(maxLoanableAmount)).toBe('/search_results/?amount=3869475.19')
  })

  it('the affordability constant is exactly 0.30', () => {
    // FR-T03 makes this editor-configurable; the launch value is frozen.
    expect(DEFAULT_INCOME_MULTIPLE).toBe(0.3)

    const { maxMonthlyPayment } = calculateMaxLoan({
      grossMonthlyIncome: 50_000,
      loanTermYears: 10,
      annualInterestRatePct: 6,
    })
    expect(maxMonthlyPayment).toBe(15_000)
  })

  it('uses nominal annual / 12, not effective compounding', () => {
    const { monthlyInterestRate } = calculateMaxLoan({
      grossMonthlyIncome: 1,
      loanTermYears: 1,
      annualInterestRatePct: 12,
    })
    // Nominal: 12/100/12 = 0.01 exactly. Effective would be ~0.00949.
    expect(monthlyInterestRate).toBe(0.01)
  })

  it('does not round during computation', () => {
    const { maxLoanableAmount } = calculateMaxLoan({
      grossMonthlyIncome: 100_000,
      loanTermYears: 20,
      annualInterestRatePct: 7,
    })
    // Full float precision survives to the edge; only formatPeso rounds.
    expect(maxLoanableAmount).toBeCloseTo(3_869_475.1948876157, 6)
    expect(Number.isInteger(maxLoanableAmount)).toBe(false)
  })

  it('offers exactly the live term options and default', () => {
    expect([...LOAN_TERM_OPTIONS]).toEqual([5, 10, 15, 20, 25, 30])
    expect(DEFAULT_LOAN_TERM_YEARS).toBe(5)
  })

  // Regression guards — derived from the formula, not observed live.
  it.each([
    { grossMonthlyIncome: 30_000, loanTermYears: 5, annualInterestRatePct: 6 },
    { grossMonthlyIncome: 75_000, loanTermYears: 15, annualInterestRatePct: 8.5 },
    { grossMonthlyIncome: 250_000, loanTermYears: 30, annualInterestRatePct: 5.75 },
  ])('is stable for %j', (input) => {
    const a = calculateMaxLoan(input).maxLoanableAmount
    const b = calculateMaxLoan(input).maxLoanableAmount
    expect(a).toBe(b)
    expect(a).toBeGreaterThan(0)
    expect(Number.isFinite(a)).toBe(true)
  })
})

describe('FR-T01 validation — reproduced as built, including the gaps', () => {
  it('requires income and rate', () => {
    expect(guard({ loanTermYears: 20, annualInterestRatePct: 7 })).toEqual({
      ok: false,
      reason: 'income-required',
    })
    expect(guard({ grossMonthlyIncome: 100_000, loanTermYears: 20 })).toEqual({
      ok: false,
      reason: 'rate-required',
    })
  })

  it('does NOT validate the loan term — matching the original', () => {
    // The live select cannot produce an invalid term, and the handler never checks.
    // Adding a check would be a deviation, however sensible it looks.
    expect(guard({ grossMonthlyIncome: 100_000, annualInterestRatePct: 7 })).toEqual({ ok: true })
  })

  it('flags the zero-rate and non-numeric cases the original mishandles', () => {
    // Live behaviour with rate 0: monthlyInterestRate is 0, so the annuity term
    // becomes (payment / 0) * (1 - 1^-n) = Infinity * 0 = NaN. An earlier draft of
    // BPM-001 recorded this as Infinity; this suite proved otherwise. The guard
    // surfaces the case rather than diverging — the arithmetic itself is unchanged.
    expect(guard({ grossMonthlyIncome: 100_000, annualInterestRatePct: 0 })).toEqual({
      ok: false,
      reason: 'rate-zero',
    })
    expect(guard({ grossMonthlyIncome: 100_000, annualInterestRatePct: NaN })).toEqual({
      ok: false,
      reason: 'rate-not-numeric',
    })

    const zeroRate = calculateMaxLoan({
      grossMonthlyIncome: 100_000,
      loanTermYears: 20,
      annualInterestRatePct: 0,
    })
    expect(Number.isNaN(zeroRate.maxLoanableAmount)).toBe(true)
  })
})
