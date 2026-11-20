import { describe, expect, it } from 'vitest'

import { distanceLabel, fmtDate, fmtMonth, manilaISO, MON, peso, pesoShort, pinText, sqm } from '@/lib/format'

// Expected values from app PRD §17.4 (computed with the reference build's own functions).
describe('money', () => {
  it('peso', () => expect(peso(26450.5)).toBe('₱26,451'))
  it.each([
    [21_500_000, '₱21.5M'],
    [20_000_000, '₱20M'],
    [1_234_567, '₱1.23M'],
    [1_000_000, '₱1M'],
    [999_999, '₱999,999'],
  ])('pesoShort(%d) = %s', (n, s) => expect(pesoShort(n)).toBe(s))
})

describe('dates (R16: three-letter months, never "Sept")', () => {
  it('fmtDate and fmtMonth', () => {
    expect(fmtDate('2026-09-03')).toBe('3 Sep 2026')
    expect(fmtMonth('2026-09-03')).toBe('Sep 2026')
  })
  it('every month label is three letters', () => {
    expect(MON).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
    for (let m = 1; m <= 12; m++) expect(fmtMonth(`2026-${String(m).padStart(2, '0')}-15`)).toMatch(/^[A-Z][a-z]{2} 2026$/)
  })
  it('a Date is read in Asia/Manila (NFR-006)', () => {
    // 2026-11-04 17:00 UTC is already 5 Nov in Manila.
    expect(manilaISO(new Date('2026-11-04T17:00:00Z'))).toBe('2026-11-05')
    expect(fmtDate(new Date('2026-11-04T17:00:00Z'))).toBe('5 Nov 2026')
    expect(manilaISO(new Date('2026-11-04T15:59:59Z'))).toBe('2026-11-04')
  })
})

describe('other formats', () => {
  it('pinText', () => expect(pinText(8.4893, 124.662)).toBe('8.48930, 124.66200'))
  it.each([
    [250, '250 m'],
    [500, '500 m'],
    [750, '750 m'],
    [1000, '1 km'],
    [1250, '1.25 km'],
    [1500, '1.5 km'],
  ])('distanceLabel(%d) = %s', (m, s) => expect(distanceLabel(m)).toBe(s))
  it('sqm', () => {
    expect(sqm(1200)).toBe('1,200 sqm')
    expect(sqm(null)).toBe('–')
  })
})
