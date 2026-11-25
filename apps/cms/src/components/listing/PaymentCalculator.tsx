'use client'

import { useState } from 'react'

const TERMS = [1, 3, 5, 10, 15, 20, 25, 30]
const RATES = [6.55, 6.8, 7, 7.75, 8.25]
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-US')}`

/**
 * BPM-020 row 41 — the live payment calculation's options (terms 1–30 years, rates 6.55–8.25 %,
 * downpayment 10–90 %). CD-26: the live script subtracts the slider as pesos, truncates the rate
 * and does not recalculate on a rate change; this computes a standard fixed-rate amortisation
 * (pending: listing-defects). Distinct from the frozen home-loan calculator (BPM-001).
 * Opening values and labels follow production (24 Nov 2026): Price, Downpayment 10 %, Payment Term
 * 1 Year, Interest Rate 6.55.
 */
export function PaymentCalculator({ price }: { price: number }) {
  const [years, setYears] = useState(1)
  const [rate, setRate] = useState(6.55)
  const [down, setDown] = useState(10)
  const principal = price * (1 - down / 100)
  const r = rate / 100 / 12
  const n = years * 12
  const monthly = r ? (principal * r) / (1 - (1 + r) ** -n) : principal / n
  const interest = monthly * n - principal
  return (
    <div className="pay-calc">
      <p className="pay-monthly"><strong>{peso(monthly)}</strong> per month</p>
      <p className="pay-sub">{years} year fixed {rate}% interest</p>
      <div className="pay-fields">
        <label className="pay-price">Price
          <input type="text" value={Math.round(price).toLocaleString('en-US')} readOnly />
        </label>
        <label>Payment Term
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>{TERMS.map((t) => <option key={t} value={t}>{t} {t === 1 ? 'Year' : 'Years'}</option>)}</select>
        </label>
        <label>Interest Rate
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>{RATES.map((t) => <option key={t} value={t}>{t}%</option>)}</select>
        </label>
        <label>Downpayment: {down}% ({peso(price * (down / 100))})
          <input type="range" min={10} max={90} step={5} value={down} onChange={(e) => setDown(Number(e.target.value))} />
        </label>
      </div>
      <dl className="pay-breakdown">
        <div><dt>Principal</dt><dd>{peso(principal)}</dd></div>
        <div><dt>Total interest</dt><dd>{peso(interest)}</dd></div>
      </dl>
    </div>
  )
}
