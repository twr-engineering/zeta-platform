'use client'

import { useState } from 'react'

import {
  DEFAULT_LOAN_TERM_YEARS,
  LOAN_TERM_OPTIONS,
  calculateMaxLoan,
  formatPeso,
  guard,
  qualifiedPropertiesUrl,
} from '@/lib/calculator'

/**
 * FR-T01 home loan calculator UI. All arithmetic is src/lib/calculator.ts (BPM-001, verified to
 * the centavo) — this component only collects input and shows the one figure it returns.
 * Labels and messages are the experience layer and are fair game; the outputs are not.
 */
export function LoanCalculator({ incomeMultiple }: { incomeMultiple: number }) {
  const [income, setIncome] = useState('')
  const [years, setYears] = useState(String(DEFAULT_LOAN_TERM_YEARS))
  const [rate, setRate] = useState('')
  const [result, setResult] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = {
      grossMonthlyIncome: income === '' ? undefined : Number(income),
      loanTermYears: Number(years),
      annualInterestRatePct: rate === '' ? undefined : Number(rate),
    }
    const g = guard(input)
    // income + rate are required, as on the live site. Zero / non-numeric rates are reported
    // here instead of showing NaN — a message, not a different number, so outputs are unchanged.
    if (!g.ok) {
      setResult(null)
      setError(
        {
          'income-required': 'Enter your gross monthly income.',
          'rate-required': 'Enter an interest rate.',
          'rate-zero': 'Enter an interest rate above 0%.',
          'rate-not-numeric': 'Enter the interest rate as a number.',
        }[g.reason],
      )
      return
    }
    setError(null)
    setResult(calculateMaxLoan(input as Parameters<typeof calculateMaxLoan>[0], incomeMultiple).maxLoanableAmount)
  }

  return (
    <form className="calculator" onSubmit={onSubmit} noValidate>
      <label>
        Gross monthly income (₱)
        <input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
      </label>
      <label>
        Loan term
        <select value={years} onChange={(e) => setYears(e.target.value)}>
          {LOAN_TERM_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y} years
            </option>
          ))}
        </select>
      </label>
      <label>
        Annual interest rate (%)
        <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </label>
      <button type="submit">Calculate</button>
      {error && <p className="calculator-error" role="alert">{error}</p>}
      {result !== null && (
        <div className="calculator-result" aria-live="polite">
          <p>Maximum loanable amount</p>
          <p className="calculator-amount">{formatPeso(result)}</p>
          <a className="button" href={qualifiedPropertiesUrl(result)}>
            See Qualified Properties
          </a>
        </div>
      )}
    </form>
  )
}
