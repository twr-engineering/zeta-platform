import { describe, expect, it } from 'vitest'

import { askingGap, bedsLabel, detailFields, gridCols, parkLabel } from '@/lib/details'
import {
  DEFAULT_BAR,
  FDEFS,
  clampRange,
  confReason,
  confidence,
  filtered,
  filtersOn,
  months,
  rangeInfo,
  rangeText,
  searched,
  sortList,
  typeInfoOf,
  visibleDefs,
} from '@/lib/filters'
import { linkLabel, listingHref } from '@/lib/listing'
import { peso } from '@/lib/format'

import { FIXTURE_TYPES, fixtureDeals } from './fixture-deals'

const DEALS = fixtureDeals()
const TODAY = '2026-11-04'
const byRef = (r: string) => DEALS.find((d) => d.ref === r)!
const typeKey = (name: string) => `id:${FIXTURE_TYPES.find((t) => t.name === name)!.id}`

describe('linkLabel (§8.8, §17.4)', () => {
  it.each([
    ['https://zetagroup.ph/r/ztp815/', 'Zeta ZTP815'],
    ['https://www.zetagroup.ph/about', 'Zeta website'],
    ['https://www.facebook.com/marketplace/item/123', 'Facebook Marketplace'],
    ['https://www.facebook.com/watch/?v=1', 'Facebook video'],
    ['https://fb.watch/abc', 'Facebook video'],
    ['https://m.facebook.com/story.php?id=1', 'Facebook post'],
    ['https://fb.me/x', 'Facebook post'],
    ['https://www.lamudi.com.ph/x', 'Lamudi listing'],
    ['https://www.carousell.ph/p/1', 'Carousell listing'],
    ['https://www.property24.com.ph/x', 'Property24 listing'],
    ['https://www.dotproperty.com.ph/x', 'Dot Property listing'],
    ['https://youtu.be/x', 'YouTube video'],
    ['https://www.tiktok.com/@a/video/1', 'TikTok video'],
    ['https://www.instagram.com/p/x', 'Instagram post'],
    ['https://www.myproperty.ph/', 'myproperty.ph'],
    ['not a link', 'Open link'],
  ])('%s → %s', (href, label) => expect(linkLabel(href)).toBe(label))
  it('a code alone links to its Zeta page', () => expect(listingHref({ code: 'ZTP815', link: null })).toBe('https://zetagroup.ph/r/ZTP815/'))
})

describe('labels (§17.4)', () => {
  it('bedsLabel and parkLabel', () => {
    expect([0, 2, 5].map(bedsLabel)).toEqual(['Studio', '2BR', '5+ BR'])
    expect([parkLabel(0, null), parkLabel(1, 'Included'), parkLabel(3, 'Separate'), parkLabel(2, null)]).toEqual(['None', '1, included in the price', '3 or more, sold separately', '2'])
  })
  it('asking gap (CD-014)', () => {
    expect(askingGap(10_000_000, 9_500_000)).toEqual({ kind: 'below', pct: '5.0' })
    expect(askingGap(10_000_000, 10_500_000)).toEqual({ kind: 'above', pct: '5.0' })
    expect(askingGap(10_000_000, 10_000_000)).toEqual({ kind: 'at' })
  })
  it('details grid columns for n = 1…18 (§17.4, CD-013)', () => {
    expect(Array.from({ length: 18 }, (_, i) => gridCols(i + 1))).toEqual([1, 2, 3, 4, 3, 3, 4, 4, 3, 4, 4, 4, 3, 3, 3, 4, 3, 3])
  })
})

describe('confidence (§8.3, §17.4)', () => {
  const r = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i)
  it('levels and spreads', () => {
    expect(confidence([1, 2, 3, 4])).toBeNull()
    const hi = confidence(r(100, 10))!
    expect(hi.lvl).toBe('High')
    expect(hi.spread).toBeCloseTo(0.0431, 4)
    expect(confidence(r(100, 9))!.lvl).toBe('Medium')
    const md = confidence([100, 110, 120, 125, 130, 140, 150])!
    expect([md.lvl, md.spread]).toEqual(['Medium', 0.16])
    const lo = confidence([10, 20, 30, 40, 50])!
    expect(lo.lvl).toBe('Low')
    expect(lo.spread).toBeCloseTo(0.667, 3)
  })
  it('reason text', () => {
    expect(confReason(confidence(r(100, 10))!, 'comps within 1 km')).toBe('10 comps within 1 km, prices close together')
    expect(confReason(confidence([100, 110, 120, 125, 130, 140, 150])!, 'deals')).toBe('only 7 deals, prices fairly spread')
    expect(confReason(confidence([10, 20, 30, 40, 50])!, 'comps within 1 km')).toBe('only 5 comps within 1 km, prices spread widely')
  })
})

describe('filters on the Appendix D set (D.5, §8.15)', () => {
  it('periods: 72 in the last 24 months, 14 in the last 3, 75 any time', () => {
    const n = (p: string) => filtered(DEALS, { ...DEFAULT_BAR, fPeriod: p }, FIXTURE_TYPES, TODAY).length
    expect([n('24'), n('3'), n('9999')]).toEqual([72, 14, 75])
  })
  it('months: whole days over 30.44', () => expect(months('2026-10-05', TODAY)).toBeCloseTo(30 / 30.44, 6))
  it('Filters sheet sections per type, in display order (CD-009)', () => {
    const labels = (name: string | null) => visibleDefs(name ? typeInfoOf(typeKey(name), FIXTURE_TYPES) : null).map((d) => d.label)
    expect(labels(null)).toEqual(['Size (sqm)', 'Mode of payment'])
    expect(labels('Residential lot')).toEqual(['Lot area (sqm)', 'Frontage', 'Lot features', 'Terrain and shape', 'Mode of payment'])
    expect(labels('House and lot')).toEqual(['Lot area (sqm)', 'Floor area (sqm)', 'Bedrooms', 'Bathrooms', 'Parking slots', 'Mode of payment', 'Condition', 'Furnishing'])
    expect(labels('Commercial building')).toEqual(['Lot area (sqm)', 'Floor area (sqm)', 'Parking slots', 'Mode of payment', 'Condition', 'Furnishing'])
    expect(labels('Warehouse')).toEqual(['Lot area (sqm)', 'Floor area (sqm)', 'Parking slots', 'Mode of payment', 'Condition'])
    expect(labels('Condo unit')).toEqual(['Floor area (sqm)', 'Bedrooms', 'Bathrooms', 'Parking slots', 'Floor level', 'Mode of payment', 'Furnishing'])
  })
  it('sheet filters: exact or more, bands, features; a filter leaves out unrecorded details', () => {
    const lot = typeKey('Residential lot')
    const run = (fx: object, fType = lot) => filtered(DEALS, { fLoc: '', fType, fPeriod: '9999', fx }, FIXTURE_TYPES, TODAY)
    expect(run({ front: 'b' }).every((d) => d.frontage! >= 15 && d.frontage! <= 25)).toBe(true)
    expect(run({ feat: 'corner' }).every((d) => d.corner)).toBe(true)
    const condo = typeKey('Condo unit')
    expect(run({ cbeds: '3' }, condo).every((d) => d.beds! >= 3)).toBe(true)
    expect(run({ cbeds: '1' }, condo).every((d) => d.beds === 1)).toBe(true)
    // A filter that is not visible for the type does nothing.
    expect(run({ cbeds: '1' }).length).toBe(run({}).length)
    expect(filtersOn({ fLoc: '', fType: lot, fPeriod: '24', fx: { cbeds: '1', front: 'a' } }, FIXTURE_TYPES)).toBe(2)
  })
  it('slider ends, step and text', () => {
    const t = typeInfoOf(typeKey('Residential lot'), FIXTURE_TYPES)!
    const info = rangeInfo(FDEFS[0], DEALS, typeKey('Residential lot'), t)
    expect(info.min % info.step).toBe(0)
    expect(info.max % info.step).toBe(0)
    expect(info.bins.reduce((a, b) => a + b, 0)).toBe(info.n)
    expect(rangeText(info, info.min, info.max)).toBe('Any')
    expect(rangeText(info, info.min, 500)).toBe('Up to 500')
    expect(rangeText(info, 400, info.max)).toBe('400 and up')
    expect(clampRange(info, 900, 400)).toEqual([400, 900])
    expect(clampRange(info, info.min - 50, info.max + 50)).toBeUndefined()
  })
})

describe('search and sort (§8.7, §7.1.4)', () => {
  it('every word, ignoring case and punctuation (CD-007)', () => {
    expect(searched(DEALS, 'xavier b22-l27').map((d) => d.ref)).toEqual(['L01'])
    expect(searched(DEALS, 'xavier b23')).toHaveLength(0)
    expect(searched(DEALS, '   ')).toHaveLength(75)
    expect(searched(DEALS, 'old masterson').map((d) => d.ref)).toEqual(['X01'])
  })
  it('sorts by each key; ties newest first', () => {
    const pp = sortList(DEALS, 'pp', 'desc').map((d) => d.pp)
    expect(pp).toEqual([...pp].sort((a, b) => b - a))
    const lots = sortList(DEALS.filter((d) => d.type.form === 'house'), 'lot', 'asc').map((d) => d.lotArea ?? 0)
    expect(lots).toEqual([...lots].sort((a, b) => a - b))
    const dates = sortList(DEALS, 'date', 'asc').map((d) => d.date)
    expect(dates).toEqual([...dates].sort())
  })
})

// D.5 "Per deal": per sqm, link label, asking pill, number of detail fields, grid columns.
const D5: [string, string, string, string, number, number][] = [
  ['L01', '₱37,069', 'Zeta ZTP815', '▼2.3%', 8, 4],
  ['L02', '₱36,800', 'Zeta ZTP816', '▲3.5%', 7, 4],
  ['L03', '₱38,192', 'Facebook post', '▼5.4%', 8, 4],
  ['L04', '₱37,500', 'Zeta ZTP901', 'At asking', 7, 4],
  ['L05', '₱36,100', 'Facebook Marketplace', '▼5.0%', 8, 4],
  ['L06', '₱38,508', 'Facebook video', '▼4.1%', 7, 4],
  ['L07', '₱36,896', 'Facebook video', 'At asking', 7, 4],
  ['L08', '₱37,796', 'Facebook post', '▼5.1%', 6, 3],
  ['L09', '₱37,304', '', '▲100.0%', 6, 3],
  ['L10', '₱37,596', 'Lamudi listing', '▼4.5%', 5, 3],
  ['L11', '₱37,893', '', '', 3, 3],
  ['L12', '₱36,503', '', '', 3, 3],
  ['L13', '₱37,200', '', '', 3, 3],
  ['L14', '₱36,700', '', '', 2, 2],
  ['L15', '₱37,400', '', '', 3, 3],
  ['L16', '₱37,100', '', '', 3, 3],
  ['L17', '₱33,500', '', '', 3, 3],
  ['P01', '₱25,500', '', '', 3, 3],
  ['P02', '₱25,594', '', '', 3, 3],
  ['P03', '₱25,393', '', '', 3, 3],
  ['P04', '₱25,600', 'Carousell listing', '', 5, 3],
  ['P05', '₱25,692', 'Property24 listing', '', 4, 4],
  ['P06', '₱25,400', 'Dot Property listing', '', 4, 4],
  ['P07', '₱25,211', 'YouTube video', '', 4, 4],
  ['P08', '₱25,708', '', '', 3, 3],
  ['P09', '₱25,000', 'TikTok video', '', 4, 4],
  ['G01', '₱30,000', '', '', 3, 3],
  ['G02', '₱38,000', '', '', 3, 3],
  ['G03', '₱46,000', '', '', 3, 3],
  ['G04', '₱55,000', 'Instagram post', '', 4, 4],
  ['G05', '₱70,000', 'myproperty.ph', '', 4, 4],
  ['N01', '₱54,000', '', '', 4, 4],
  ['N02', '₱55,000', 'Zeta ZTP777', '', 5, 3],
  ['N03', '₱54,000', '', '', 4, 4],
  ['N04', '₱55,000', '', '', 5, 3],
  ['N05', '₱54,000', '', '', 4, 4],
  ['N06', '₱54,000', '', '', 4, 4],
  ['S01', '₱44,000', '', '', 4, 4],
  ['S02', '₱44,000', '', '', 4, 4],
  ['S03', '₱44,000', '', '', 4, 4],
  ['S04', '₱44,000', '', '', 4, 4],
  ['I01', '₱9,500', '', '', 4, 4],
  ['B01', '₱16,000', '', '', 4, 4],
  ['B02', '₱15,000', '', '', 4, 4],
  ['A01', '₱100', '', '', 3, 3],
  ['T01', '₱10,000', '', '', 3, 3],
  ['T02', '₱15,000', '', '▼7.7%', 5, 3],
  ['U01', '₱26,000', '', '', 4, 4],
  ['H01', '₱68,000', '', '', 10, 4],
  ['H02', '₱88,000', '', '', 10, 4],
  ['H03', '₱74,000', '', '', 10, 4],
  ['H04', '₱60,000', '', '', 7, 4],
  ['H05', '₱84,000', '', '', 9, 3],
  ['H06', '₱72,000', '', '', 3, 3],
  ['H07', '₱76,000', '', '', 3, 3],
  ['H08', '₱64,000', '', '', 3, 3],
  ['H09', '₱80,000', '', '', 4, 4],
  ['H10', '₱92,000', '', '▼1.4%', 11, 4],
  ['W01', '₱52,000', '', '', 9, 3],
  ['K01', '₱62,000', '', '', 9, 3],
  ['K02', '₱62,000', '', '', 6, 3],
  ['R01', '₱30,000', '', '', 7, 4],
  ['C01', '₱128,000', '', '', 7, 4],
  ['C02', '₱140,000', '', '', 7, 4],
  ['C03', '₱130,000', '', '', 7, 4],
  ['C04', '₱125,000', '', '', 4, 4],
  ['C05', '₱136,000', '', '', 7, 4],
  ['C06', '₱131,000', '', '', 4, 4],
  ['C07', '₱150,000', '', '', 6, 3],
  ['C08', '₱122,000', '', '', 7, 4],
  ['E01', '₱150,000', '', '', 7, 4],
  ['E02', '₱140,000', '', '', 6, 3],
  ['O01', '₱1,000,000', '', '', 3, 3],
  ['X01', '₱30,000', '', '', 3, 3],
  ['X02', '₱60,000', '', '', 2, 2],
]

describe('details for every Appendix D deal (D.5, CD-012, CD-017)', () => {
  it.each(D5)('%s', (ref, pp, link, pill, n, cols) => {
    const d = byRef(ref)
    const f = detailFields(d)
    expect(peso(d.pp)).toBe(pp)
    expect(f).toHaveLength(n)
    expect(gridCols(f.length)).toBe(cols)
    const l = f.find((x) => x.kind === 'link')
    expect(l ? linkLabel(l.href) : '').toBe(link)
    const a = f.find((x) => x.kind === 'asking')
    const shown = !a || a.kind !== 'asking' ? '' : a.gap.kind === 'at' ? 'At asking' : `${a.gap.kind === 'below' ? '▼' : '▲'}${a.gap.pct}%`
    expect(shown).toBe(pill)
  })
  it('a condo shows Floor level after Parking and before Mode of payment, no lot fields (CD-012)', () => {
    const labels = detailFields(byRef('C02')).map((x) => x.label)
    expect(labels).not.toContain('Frontage')
    expect(labels).not.toContain('Lot features')
    expect(labels.indexOf('Floor level')).toBeGreaterThan(labels.indexOf('Parking'))
  })
  it('a name not in Settings gets no Location type (CD-018)', () => {
    expect(detailFields(byRef('X01')).map((x) => x.label)).not.toContain('Location type')
  })
})
