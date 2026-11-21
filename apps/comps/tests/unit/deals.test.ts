import { describe, expect, it } from 'vitest'

import {
  DEAL_COPY,
  buildRecord,
  checkDeal,
  commas,
  digits,
  inputShapeOk,
  nearestPlace,
  normBL,
  preview,
  suggestionHint,
  type CheckCtx,
  type DealInput,
  type TypeInfo,
} from '@/lib/deals'
import { listingUrl, zetaCode } from '@/lib/listing'
import { metres, pct } from '@/lib/stats'

const LOT: TypeInfo = { form: 'lot', category: 'Residential' }
const HOUSE: TypeInfo = { form: 'house', category: 'Residential' }
const CONDO: TypeInfo = { form: 'condo', category: 'Residential' }
const TODAY = '2026-11-21'

const ctx = (over: Partial<CheckCtx> = {}): CheckCtx => ({
  kind: 'Subdivision',
  type: LOT,
  locKey: 'id:1',
  others: [{ id: 99, locKey: 'id:1', details: 'B22 L27', price: 21_500_000 }],
  today: TODAY,
  ...over,
})
const ok: DealInput = { pin: '8.48930, 124.66200', locationId: 1, typeId: 1, details: 'B1 L1', area: '580', price: '21,500,000', date: '2026-10-12' }
const run = (over: DealInput, c: Partial<CheckCtx> = {}) => checkDeal({ ...ok, ...over }, ctx(c))

describe('deal validation, one case per row of §8.6.3 (R4, ADD-002)', () => {
  it('passes a valid deal', () => expect(run({})).toBeNull())
  const rows: [string, DealInput, Partial<CheckCtx>, string, string][] = [
    ['1 pin does not parse', { pin: 'abc' }, {}, 'pin', DEAL_COPY.pinParse],
    ['2 pin outside CDO', { pin: '124.662, 8.4893' }, {}, 'pin', DEAL_COPY.pinOut],
    ['3 no location', {}, { kind: null }, 'locationId', 'Choose the subdivision or area.'],
    ['4 condo details', { details: ' ' }, { type: CONDO }, 'details', 'Enter the property details, such as the tower and unit number.'],
    ['4 other details', { details: '' }, {}, 'details', DEAL_COPY.detailsOther],
    ['5 lot area missing', { area: '' }, {}, 'area', 'Enter the lot area in sqm.'],
    ['5 floor area missing', { area: '0', lotArea: '300' }, { type: HOUSE }, 'area', 'Enter the floor area in sqm.'],
    ['6 area range (lot)', { area: '5' }, {}, 'area', 'Check the lot area. It should be between 10 and 1,000,000 sqm.'],
    ['6 area range (floor)', { area: '2000000' }, { type: CONDO }, 'area', 'Check the floor area. It should be between 10 and 1,000,000 sqm.'],
    ['7 house lot area missing', { area: '200' }, { type: HOUSE }, 'lotArea', 'Enter the lot area in sqm, from the title.'],
    ['8 house lot area range', { area: '200', lotArea: '9' }, { type: HOUSE }, 'lotArea', 'Check the lot area. It should be between 10 and 1,000,000 sqm.'],
    ['9 frontage range', { frontage: '2001' }, {}, 'frontage', 'Check the frontage. It should be between 1 and 2,000 metres.'],
    ['10 lot in an Area, no frontage', { details: '' }, { kind: 'Zone' }, 'frontage', 'A lot outside a subdivision needs its frontage in metres.'],
    ['10 a typed 0 fails here, not row 9', { frontage: '0' }, { kind: 'Zone' }, 'frontage', DEAL_COPY.frontageNeeded],
    ['11 price missing', { price: '' }, {}, 'price', 'Enter the sold price. Only enter it if you know it is accurate.'],
    ['12 duplicate (ADD-004)', { details: 'b22-l27', price: '21500000' }, {}, 'details', 'This looks like a deal already saved: same location, b22-l27 and sold price. Check the deal list before adding it again.'],
    ['13 no date', { date: '' }, {}, 'date', 'Enter the date sold.'],
    ['14 future date', { date: '2026-11-22' }, {}, 'date', 'The date sold is in the future.'],
    ['15 before 2000', { date: '1999-12-31' }, {}, 'date', 'Check the date sold. Deals from before 2000 are too old to use as comps.'],
    ['16 price per sqm', { price: '5000', area: '100' }, {}, 'price', 'That works out to ₱50 per sqm, which looks wrong. Check the area and the sold price.'],
    ['17 days on market', { dom: '3651' }, {}, 'dom', 'Check the days on market. It should be between 0 and 3,650.'],
    ['18 asking far below', { asking: '10,000,000' }, {}, 'asking', 'The asking price looks far below the sold price. Check both numbers.'],
    ['19 year built', { area: '200', lotArea: '300', year: '2028' }, { type: HOUSE }, 'year', 'Check the year built.'],
    ['20 floor level', { floor: '101' }, { type: CONDO }, 'floor', 'Check the floor level.'],
    ['21 bad link', { codeOrLink: 'https://exa mple.com' }, {}, 'codeOrLink', DEAL_COPY.link],
  ]
  it.each(rows)('%s', (_, input, c, field, message) => expect(run(input, c)).toEqual({ field, message }))

  it('stops at the first failure', () => expect(run({ pin: '', area: '' })?.field).toBe('pin'))
  it('duplicate ignores the deal being edited and other places', () => {
    expect(run({ details: 'B22 L27', price: '21500000' }, { editId: 99 })).toBeNull()
    expect(run({ details: 'B22 L27', price: '21500000' }, { locKey: 'id:2' })).toBeNull()
  })
  it('accepts edge values: pin bounds, today, next year, dom 0, asking exactly half', () => {
    expect(run({ pin: '8.2, 124.3', date: TODAY, dom: '0', asking: '10,750,000' })).toBeNull()
    expect(run({ area: '200', lotArea: '300', year: '2027' }, { type: HOUSE })).toBeNull()
  })
  it('a name not in Settings has none of the Area or Subdivision rules', () => expect(run({ details: '' }, { kind: '' })).toBeNull())
})

describe('record builder (§8.6.4)', () => {
  it('drops house-only and condo-only fields from a lot', () => {
    const r = buildRecord({ ...ok, lotArea: '300', cond: 'Good', year: '2018', storeys: '2', floor: '5', furn: 'Furnished', beds: '3', baths: '2', parking: '1', parkIncl: 'Included', corner: true, ridgeView: true, terrain: 'Flat', frontage: '20' }, LOT)
    expect(r).toMatchObject({ lotArea: null, cond: null, yearBuilt: null, storeys: null, floor: null, furn: null, beds: null, baths: null, parking: null, parkIncl: null })
    expect(r).toMatchObject({ corner: true, view: 'Ridge view', terrain: 'Flat', frontage: 20, price: 21_500_000, area: 580, lat: 8.4893, lng: 124.662 })
  })
  it('drops lot-only fields from a house and keeps its own', () => {
    const r = buildRecord({ ...ok, area: '200', lotArea: '300', corner: true, ridgeView: true, terrain: 'Sloped', frontage: '20', cond: 'Good', year: '2018', storeys: '2', beds: '3', baths: '2', parking: '0' }, HOUSE)
    expect(r).toMatchObject({ corner: false, view: null, terrain: null, frontage: null, lotArea: 300, cond: 'Good', yearBuilt: 2018, storeys: 2, beds: 3, baths: 2, parking: 0 })
  })
  it('condo: parking in the price only when parking is not 0', () => {
    expect(buildRecord({ ...ok, parking: '0', parkIncl: 'Included' }, CONDO).parkIncl).toBeNull()
    expect(buildRecord({ ...ok, parking: '', parkIncl: 'Included' }, CONDO).parkIncl).toBe('Included')
  })
  it('code or link: Zeta link → code, other link → normalized URL, else cleaned code', () => {
    expect(buildRecord({ ...ok, codeOrLink: 'https://www.zetagroup.ph/r/ztp816/' }, LOT)).toMatchObject({ code: 'ZTP816', link: null })
    expect(buildRecord({ ...ok, codeOrLink: 'https://Lamudi.com.ph/x' }, LOT)).toMatchObject({ code: null, link: 'https://lamudi.com.ph/x' })
    expect(buildRecord({ ...ok, codeOrLink: ' ztp 777!' }, LOT)).toMatchObject({ code: 'ZTP777', link: null })
    expect(buildRecord({ ...ok, codeOrLink: '!!' }, LOT).code).toBeNull()
  })
  it('trims details, collapses and caps notes, rounds money, keeps dom 0', () => {
    const r = buildRecord({ ...ok, details: '  B1 L1 ', note: `  a   b\n${'x'.repeat(400)}`, price: '1,000,000.6', asking: '1,200,000.4', dom: '0' }, LOT)
    expect(r.details).toBe('B1 L1')
    expect(r.note).toHaveLength(300)
    expect(r.note!.startsWith('a b x')).toBe(true)
    expect(r).toMatchObject({ price: 1_000_001, asking: 1_200_000, dom: 0 })
  })
})

describe('parsing and helpers', () => {
  it('digits, commas, normBL (§17.4)', () => {
    expect(digits('₱21,500,000')).toBe(21_500_000)
    expect(digits('')).toBeNaN()
    expect(commas('21500000')).toBe('21,500,000')
    expect(commas('abc')).toBe('abc')
    expect(['B22 L27', 'b22-l27', 'Blk 22, Lot 27'].map(normBL)).toEqual(['b22l27', 'b22l27', 'blk22lot27'])
  })
  it('zetaCode and listingUrl', () => {
    expect(zetaCode('https://zetagroup.ph/r/ztp815/')).toBe('ZTP815')
    expect(zetaCode('https://zetagroup.ph/about')).toBe('')
    expect(listingUrl('ZTP815')).toBe('https://zetagroup.ph/r/ZTP815/')
  })
  it('pct (§17.4)', () => {
    expect([0.25, 0.5, 0.75].map((p) => pct([1, 2, 3, 4], p))).toEqual([1.75, 2.5, 3.25])
    expect([0.25, 0.5, 0.75].map((p) => pct([10, 20, 30, 40, 50], p))).toEqual([20, 30, 40])
    expect(pct([], 0.5)).toBeNaN()
  })
  it('shape check refuses wrong types and unknown choices', () => {
    expect(inputShapeOk({ ...ok })).toBe(true)
    expect(inputShapeOk({ ...ok, corner: 'yes' })).toBe(false)
    expect(inputShapeOk({ ...ok, fin: 'Barter' })).toBe(false)
    expect(inputShapeOk({ ...ok, beds: '9' })).toBe(false)
    expect(inputShapeOk({ ...ok, locationId: 'abc' })).toBe(false)
  })
})

describe('preview (§7.4.4, ADD-005)', () => {
  it('empty until area and price are in', () => expect(preview(0, 100, true, [])).toEqual({ kind: 'empty' }))
  it('price only with fewer than 5 peers or no location', () => {
    expect(preview(100, 3_000_000, true, [1, 2, 3, 4])).toMatchObject({ kind: 'value', pp: 30_000, median: null, warn: false })
    expect(preview(100, 3_000_000, false, [1, 2, 3, 4, 5])).toMatchObject({ median: null })
  })
  it('warns over 35% off the middle of 5 or more', () => {
    const peers = [30_000, 30_000, 30_000, 30_000, 30_000, 30_000]
    expect(preview(100, 4_200_000, true, peers)).toMatchObject({ median: 30_000, n: 6, warn: true, dev: 40 })
    expect(preview(100, 4_000_000, true, peers)).toMatchObject({ warn: false })
  })
})

describe('location suggestion (§7.4.2, ADD-008)', () => {
  const pueblo = { key: 'id:2', lat: 8.462, lng: 124.629 }
  it('three distance bands', () => {
    const at = (m: number) => ({ lat: pueblo.lat + m / 111_195, lng: pueblo.lng })
    const s = (m: number) => suggestionHint(nearestPlace(at(m), [pueblo], metres))
    expect(s(300)).toEqual({ key: 'id:2', hint: 'suggested from the pin, change it if wrong', warn: false })
    expect(s(800)).toEqual({ key: 'id:2', hint: 'nearest saved place is 0.8 km away, check it is right, or add a new one at the end of the list', warn: true })
    expect(s(1600)).toEqual({ key: '', hint: 'no saved place near the pin, choose one, or add a new one at the end of the list', warn: true })
    expect(suggestionHint(null).key).toBe('')
  })
})
