import { describe, expect, it } from 'vitest'

import { DEFAULT_CMA_SETTINGS, LOW_NOTE, criteria, description, isSimilar, runCma, searchSummary, type CmaSettings, type Subject } from '@/lib/cma'
import type { DealJSON } from '@/lib/data'
import { refKey } from '@/lib/deals'
import { confReason } from '@/lib/filters'
import { distanceLabel, peso, pesoShort } from '@/lib/format'

import { FIXTURE_TYPES, fixtureDeals } from './fixture-deals'

// Appendix D.5 CMA scenarios, computed for a seed run on 4 Nov 2026.
const TODAY = '2026-11-04'
const DEALS = fixtureDeals()
const ref = (d: DealJSON) => (d as DealJSON & { ref: string }).ref
const PIN = { XE: { lat: 8.489, lng: 124.662 }, CE: { lat: 8.478, lng: 124.647 }, US: { lat: 8.47, lng: 124.635 } }

function subject(typeName: string, pin: { lat: number; lng: number }, over: Partial<Subject> = {}): Subject {
  const t = FIXTURE_TYPES.find((x) => x.name === typeName)!
  return {
    typeKey: refKey(t), typeName, type: { form: t.form, category: t.category }, area: 0, lotArea: 0, frontage: 0, corner: false, ridge: false, terrain: '',
    beds: null, baths: null, parking: null, parkIncl: '', cond: '', year: null, floor: null, furn: '', asking: 0, ...pin, ...over,
  }
}
function run(s: Subject, st: Partial<CmaSettings> = {}) {
  const settings = { ...DEFAULT_CMA_SETTINGS, ...st }
  const c = runCma(s, DEALS, settings, TODAY)
  const out: Record<string, unknown> = {
    comps: c.inside.map((x) => `${ref(x.d)} ${Math.round(x.dist)} m`).join(', '),
    tooFar: c.tooFar.map((x) => ref(x.d)).join(', ') || 'none',
  }
  const r = c.result
  if (r.kind === 'ok') {
    Object.assign(out, {
      estimate: `${pesoShort(r.low)} to ${pesoShort(r.high)}`,
      mid: pesoShort(r.mid),
      med: peso(r.med),
      conf: `${r.conf.lvl} confidence, "${confReason(r.conf, `comps within ${distanceLabel(settings.radius)}`)}"`,
      asking: r.asking ? `${r.asking.pct}% ${r.asking.dir} the middle estimate` : null,
      notes: r.notes,
    })
  } else out.kind = r.kind === 'few' ? `few ${r.n}` : 'noarea'
  return out
}

const A1 = subject('Residential lot', PIN.XE, { area: 500, frontage: 20 })
const A1_COMPS = 'L01 120 m, L02 250 m, L03 301 m, L04 352 m, L05 400 m, L06 451 m, L07 503 m, L08 600 m, L09 704 m, L10 900 m'
const B1 = subject('House and lot', PIN.XE, { area: 200, lotArea: 300, beds: 3 })
const B_COMPS = 'H01 101 m, H02 160 m, H03 220 m, H04 280 m, H05 342 m, H06 402 m'
const C1 = subject('Condo unit', PIN.CE, { area: 40, beds: 1 })
const C_COMPS = 'C01 40 m, C02 65 m, C03 90 m, C04 115 m, C05 141 m'
const D1 = subject('Commercial lot', PIN.US, { area: 600, frontage: 20 })
const known = (m: number, n: number) => `the ${m} comps that have this recorded (out of ${n})`

describe('CMA scenarios (D.5, CMA-004, CMA-005)', () => {
  it('A1: residential lot, 1 km, 24 months, similar on', () =>
    expect(run(A1)).toEqual({
      comps: A1_COMPS, tooFar: 'L15, L16', estimate: '₱18.47M to ₱18.87M', mid: '₱18.7M', med: '₱37,402',
      conf: 'High confidence, "10 comps within 1 km, prices close together"', asking: null, notes: ['5 of the 10 comps are corner lots, which may push this estimate up.'],
    }))
  it('A2: similar off', () =>
    expect(run(A1, { similar: false })).toEqual({
      comps: 'L01 120 m, L11 200 m, L02 250 m, L12 251 m, L13 300 m, L03 301 m, L14 352 m, L04 352 m, L05 400 m, L06 451 m, L07 503 m, L08 600 m, L09 704 m, L10 900 m',
      tooFar: 'L15, L16, U01', estimate: '₱18.41M to ₱18.87M', mid: '₱18.63M', med: '₱37,252', conf: 'High confidence, "14 comps within 1 km, prices close together"', asking: null, notes: [],
    }))
  it('A3: 1.25 km', () =>
    expect(run(A1, { radius: 1250 })).toEqual({
      comps: `${A1_COMPS}, L15 1206 m`, tooFar: 'L16, X01', estimate: '₱18.49M to ₱18.85M', mid: '₱18.7M', med: '₱37,400',
      conf: 'High confidence, "11 comps within 1.25 km, prices close together"', asking: null, notes: ['5 of the 11 comps are corner lots, which may push this estimate up.'],
    }))
  it('A4: last 36 months', () =>
    expect(run(A1, { months: 36 })).toMatchObject({ comps: 'L01 120 m, L17 150 m, ' + A1_COMPS.slice('L01 120 m, '.length), estimate: '₱18.42M to ₱18.85M', mid: '₱18.65M', med: '₱37,304' }))
  it('A5: corner, ridge view and sloped never remove comps; three notes', () =>
    expect(run({ ...A1, corner: true, ridge: true, terrain: 'Sloped' })).toMatchObject({
      comps: A1_COMPS,
      notes: [
        '5 of the 10 comps are corner lots. Corner lots usually sell higher, so this estimate may be low for this one.',
        '2 of the 10 comps are recorded with a ridge view. Ridge view lots usually sell higher, so this estimate may be low for this one.',
        'Only 1 of the 10 comps is recorded as sloped. Sloped lots usually sell lower, so this estimate may be high for this one.',
      ],
    }))
  it('A6: asking price', () => expect(run({ ...A1, asking: 21_000_000 })).toMatchObject({ asking: '12% above the middle estimate' }))
  it('B1: house and lot', () =>
    expect(run(B1)).toEqual({ comps: B_COMPS, tooFar: 'none', estimate: '₱13.8M to ₱16.3M', mid: '₱14.6M', med: '₱73,000', conf: 'Low confidence, "only 6 comps within 1 km, prices fairly spread"', asking: null, notes: [LOW_NOTE] }))
  it('B2: better than most', () =>
    expect(run({ ...B1, cond: 'Brand new', year: 2024, furn: 'Furnished', baths: 4, parking: 3 })).toMatchObject({
      comps: B_COMPS,
      notes: [
        `It is in better condition than most of ${known(5, 6)}, so this estimate may be low for this one.`,
        `It is newer than most of ${known(5, 6)}, so this estimate may be low for this one.`,
        `It is more furnished than most of ${known(4, 6)}, so this estimate may be low for this one.`,
        `It has more bathrooms than most of ${known(4, 6)}, so this estimate may be low for this one.`,
        `It has more parking than most of ${known(4, 6)}, so this estimate may be low for this one.`,
        LOW_NOTE,
      ],
    }))
  it('B3: worse than most', () =>
    expect(run({ ...B1, cond: 'Needs repair', year: 2000, furn: 'Unfurnished', baths: 1, parking: 0 })).toMatchObject({
      notes: [
        `It is in worse condition than most of ${known(5, 6)}, so this estimate may be high for this one.`,
        `It is older than most of ${known(5, 6)}, so this estimate may be high for this one.`,
        `It is less furnished than most of ${known(4, 6)}, so this estimate may be high for this one.`,
        `It has fewer bathrooms than most of ${known(4, 6)}, so this estimate may be high for this one.`,
        `It has less parking than most of ${known(4, 6)}, so this estimate may be high for this one.`,
        LOW_NOTE,
      ],
    }))
  it('C1: condo unit', () =>
    expect(run(C1)).toEqual({ comps: C_COMPS, tooFar: 'none', estimate: '₱5.12M to ₱5.44M', mid: '₱5.2M', med: '₱130,000', conf: 'Low confidence, "only 5 comps within 1 km, prices close together"', asking: null, notes: [LOW_NOTE] }))
  it('C2: higher floor, parking included', () =>
    expect(run({ ...C1, parking: 1, parkIncl: 'Included', floor: 40 })).toMatchObject({
      notes: [
        'It is on a higher floor than most of the 5 comps, so this estimate may be low for this one.',
        `Its price includes parking, unlike most of ${known(4, 5)}, so this estimate may be low for this one.`,
        LOW_NOTE,
      ],
    }))
  it('C3: lower floor, no parking', () =>
    expect(run({ ...C1, parking: 0, floor: 1 })).toMatchObject({
      notes: [
        'It is on a lower floor than most of the 5 comps, so this estimate may be high for this one.',
        `Its price does not include parking, unlike most of ${known(4, 5)}, so this estimate may be high for this one.`,
        LOW_NOTE,
      ],
    }))
  it('D1: 500 m, not enough comps', () => expect(run(D1, { radius: 500 })).toEqual({ comps: 'S01 151 m, S02 250 m, S03 352 m, S04 449 m', tooFar: 'G01, G02', kind: 'few 4' }))
  it('D2: 1 km', () =>
    expect(run(D1)).toEqual({
      comps: 'S01 151 m, S02 250 m, S03 352 m, S04 449 m, G01 687 m, G02 797 m', tooFar: 'none', estimate: '₱23.7M to ₱26.4M', mid: '₱26.4M', med: '₱44,000',
      conf: 'Low confidence, "only 6 comps within 1 km, prices close together"', asking: null, notes: [LOW_NOTE],
    }))
  it('no area: no estimate', () => expect(run({ ...A1, area: 0 }).kind).toBe('noarea'))
})

describe('criteria, similar edges, description, summary (§8.11, §17.4)', () => {
  it('criteria texts for A1, B1, C1', () => {
    expect(criteria(A1)).toEqual(['similar lot size, frontage within 30% of 20 m'])
    expect(criteria(B1)).toEqual(['floor area within 30% of 200 sqm', 'lot area within 30% of 300 sqm', 'same bedrooms (3BR)'])
    expect(criteria(C1)).toEqual(['floor area within 30% of 40 sqm', 'same bedrooms (1BR)'])
    expect(criteria(subject('House and lot', PIN.XE, { area: 1200 }))).toEqual(['floor area within 30% of 1,200 sqm'])
  })
  it('similar (lot): subject 500 sqm, 20 m; comp 450 sqm 26 m / 26.1 m / 290 sqm 20 m', () => {
    const d = (area: number, frontage: number) => ({ ...DEALS[0], area, frontage, band: area < 300 ? 'u' : area <= 1000 ? 'm' : 'o' }) as DealJSON
    const s = subject('Residential lot', PIN.XE, { area: 500, frontage: 20 })
    expect([isSimilar(s, d(450, 26)), isSimilar(s, d(450, 26.1)), isSimilar(s, d(290, 20))]).toEqual([true, false, false])
  })
  it('similar (house): subject floor 200, lot 300, 3 beds; comp floor 260 lot 210 beds 3 / floor 261', () => {
    const d = (area: number) => ({ ...DEALS[0], area, lotArea: 210, beds: 3 }) as DealJSON
    expect([isSimilar(B1, d(260)), isSimilar(B1, d(261))]).toEqual([true, false])
  })
  it('description', () => {
    expect(description(subject('Commercial lot', PIN.US, { area: 720, frontage: 24, corner: true }))).toBe('Commercial lot, 720 sqm, 24 m frontage, corner lot')
    expect(description({ ...B1, area: 1200 })).toBe('House and lot, 1,200 sqm floor on a 300 sqm lot, 3BR')
  })
  it('search summary (CMA-008)', () => expect(searchSummary({ radius: 1250, months: 12, similar: true }, true)).toBe('1.25 km, last 12 months, similar only'))
  it('CMA-006: 10k…50k per sqm, area 100 → ₱2M to ₱4M, ₱3M, ₱30,000, Low', () => {
    const base = DEALS.find((x) => x.type.name === 'Residential lot')!
    const comps = [10_000, 20_000, 30_000, 40_000, 50_000].map((pp, i) => ({ ...base, id: 900 + i, pp, lat: PIN.XE.lat, lng: PIN.XE.lng, date: '2026-10-01' }))
    const c = runCma(subject('Residential lot', PIN.XE, { area: 100 }), comps, DEFAULT_CMA_SETTINGS, TODAY)
    if (c.result.kind !== 'ok') throw new Error(c.result.kind)
    expect([`${pesoShort(c.result.low)} to ${pesoShort(c.result.high)}`, pesoShort(c.result.mid), peso(c.result.med), c.result.conf.lvl]).toEqual(['₱2M to ₱4M', '₱3M', '₱30,000', 'Low'])
  })
})
