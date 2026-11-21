import { describe, expect, it } from 'vitest'

import { DEFAULT_BAR, confReason, filtered } from '@/lib/filters'
import { peso } from '@/lib/format'
import { PERIOD, groupsOf, labelStep, pIndex, trendPoints, yRange, type Group, type TrendBy } from '@/lib/rates'

import { FIXTURE_TYPES, fixtureDeals } from './fixture-deals'

// D.5 was computed for a seed run on 4 Nov 2026.
const TODAY = '2026-11-04'
const DEALS = fixtureDeals()
const rows = (fPeriod = '24') => groupsOf(filtered(DEALS, { ...DEFAULT_BAR, fPeriod }, FIXTURE_TYPES, TODAY))
const name = (g: Group) => `${g.loc}, ${g.type}`

describe('Market rates rows (D.5, MR-001, MR-002, MR-004)', () => {
  it('ready rows in order with middle price, range, confidence and reason', () => {
    const ready = rows().filter((g) => g.ok)
    expect(ready.map((g) => [name(g), g.kind === 'Zone', g.n, peso(g.med), `${peso(g.p25)} to ${peso(g.p75)}`, g.conf!.lvl, confReason(g.conf!, 'deals')])).toEqual([
      ['Centrio, Condo unit', false, 8, '₱130,500', '₱127,250 to ₱137,000', 'Medium', 'only 8 deals, prices close together'],
      ['Gran Europa, Commercial lot', false, 5, '₱46,000', '₱38,000 to ₱55,000', 'Low', 'only 5 deals, prices spread widely'],
      ['Pueblo de Oro, Residential lot', false, 9, '₱25,500', '₱25,393 to ₱25,600', 'Medium', 'only 9 deals, prices close together'],
      ['Xavier Estates, House and lot', false, 10, '₱75,000', '₱69,000 to ₱83,000', 'Medium', '10 deals, prices fairly spread'],
      ['Xavier Estates, Residential lot', false, 16, '₱37,252', '₱36,872 to ₱37,646', 'High', '16 deals, prices close together'],
      ['Uptown main road, north stretch, Commercial lot', true, 6, '₱54,000', '₱54,000 to ₱54,750', 'Low', 'only 6 deals, prices close together'],
    ])
  })
  it('12 waiting rows: subdivisions A to Z (a name not in Settings with them), Areas last', () => {
    const waiting = rows().filter((g) => !g.ok)
    expect(waiting.map((g) => `${name(g)} ${g.n}`)).toEqual([
      'Centrio, Condotel unit 2', 'Centrio, Office unit 1', 'Gran Europa, Agricultural lot 1', 'Old Masterson Road, Residential lot 1',
      'Pueblo de Oro, Townhouse 1', 'Teakwood Hills, Beach lot 2', 'Xavier Estates, Duplex 1', 'Uptown back lane, Residential lot 1',
      'Uptown inner roads, Industrial lot 1', 'Uptown inner roads, Warehouse 1', 'Uptown main road, north stretch, Commercial building 2',
      'Uptown main road, south stretch, Commercial lot 4',
    ])
  })
  it('any time: Xavier Estates, Residential lot has 17 deals; Teakwood Hills, Residential lot waits with 2', () => {
    const all = rows('9999')
    const xe = all.find((g) => name(g) === 'Xavier Estates, Residential lot')!
    expect([xe.n, peso(xe.med), `${peso(xe.p25)} to ${peso(xe.p75)}`, xe.conf!.lvl]).toEqual([17, '₱37,200', '₱36,800 to ₱37,596', 'High'])
    expect(all.find((g) => name(g) === 'Teakwood Hills, Residential lot')!.n).toBe(2)
  })
})

/** D.5 notation: "Q−n:k=₱m", no "=" under 2 deals. */
function trend(rowName: string, by: TrendBy): string {
  const g = rows().find((x) => name(x) === rowName)!
  const { pts, cur } = trendPoints(g.list, by, TODAY)
  const vals = pts.filter((p) => p.med !== null)
  const word = PERIOD[by].word
  if (vals.length < 2) return vals.length ? `only one ${word} at ${peso(vals[0].med!)}` : `no ${word}`
  const pre = { q: 'Q', h: 'H', y: 'Y' }[by]
  return pts.map((p) => `${pre}−${cur - p.q}:${p.n}${p.med !== null ? '=' + peso(p.med) : ''}`).join(', ')
}

describe('trend per ready row (D.5, MR-005, MR-006)', () => {
  it.each([
    ['Centrio, Condo unit', 'q', 'Q−3:2=₱123,500, Q−2:2=₱140,000, Q−1:2=₱135,500, Q−0:2=₱132,000'],
    ['Centrio, Condo unit', 'h', 'H−1:4=₱127,500, H−0:4=₱133,500'],
    ['Centrio, Condo unit', 'y', 'only one year at ₱130,500'],
    ['Gran Europa, Commercial lot', 'q', 'no quarter'],
    ['Gran Europa, Commercial lot', 'h', 'H−2:1, H−1:2=₱50,500, H−0:2=₱34,000'],
    ['Gran Europa, Commercial lot', 'y', 'only one year at ₱42,000'],
    ['Pueblo de Oro, Residential lot', 'q', 'only one quarter at ₱25,500'],
    ['Pueblo de Oro, Residential lot', 'h', 'only one half-year at ₱25,500'],
    ['Pueblo de Oro, Residential lot', 'y', 'only one year at ₱25,547'],
    ['Xavier Estates, House and lot', 'q', 'Q−6:1, Q−5:1, Q−4:1, Q−3:1, Q−2:2=₱83,000, Q−1:2=₱84,000, Q−0:2=₱66,000'],
    ['Xavier Estates, House and lot', 'h', 'H−3:1, H−2:2=₱78,000, H−1:3=₱74,000, H−0:4=₱74,000'],
    ['Xavier Estates, House and lot', 'y', 'Y−1:3=₱76,000, Y−0:7=₱74,000'],
    ['Xavier Estates, Residential lot', 'q', 'Q−6:2=₱36,934, Q−5:1, Q−4:3=₱37,500, Q−3:0, Q−2:3=₱36,896, Q−1:3=₱37,200, Q−0:4=₱37,352'],
    ['Xavier Estates, Residential lot', 'h', 'H−3:2=₱36,934, H−2:4=₱37,696, H−1:3=₱36,896, H−0:7=₱37,304'],
    ['Xavier Estates, Residential lot', 'y', 'Y−1:6=₱37,284, Y−0:10=₱37,252'],
    ['Uptown main road, north stretch, Commercial lot', 'q', 'no quarter'],
    ['Uptown main road, north stretch, Commercial lot', 'h', 'H−2:2=₱54,000, H−1:2=₱54,500, H−0:2=₱54,500'],
    ['Uptown main road, north stretch, Commercial lot', 'y', 'Y−1:2=₱54,000, Y−0:4=₱54,500'],
  ] as [string, TrendBy, string][])('%s by %s', (row, by, expected) => expect(trend(row, by)).toBe(expected))
})

describe('periods and chart helpers (§7.2.4, §17.4)', () => {
  it('pIndex and labels: Q4 ’26, H2 ’26, 2026', () => {
    expect(PERIOD.q.label(pIndex('2026-11-04', 4))).toBe('Q4 ’26')
    expect(PERIOD.h.label(pIndex('2026-07-01', 2))).toBe('H2 ’26')
    expect(PERIOD.y.label(pIndex('2026-01-01', 1))).toBe('2026')
    expect(pIndex('2026-03-31', 4) + 1).toBe(pIndex('2026-04-01', 4))
  })
  it('x-label step: spacing 30 px → 2 (R14)', () => {
    expect(labelStep(30)).toBe(2)
    expect(labelStep(58)).toBe(1)
    expect(labelStep(14)).toBe(5)
  })
  it('y range', () => {
    expect(yRange([36_934, 37_352])).toEqual([34_000, 40_000])
    expect(yRange([1000, 1000])).toEqual([0, 2000])
  })
})
