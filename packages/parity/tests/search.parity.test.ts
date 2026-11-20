import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { bandHull, getAll, parseSearch, resolvePerPage, resolveSort, toCrmParams } from '../src/search/params'

/**
 * GOLDEN MASTER — search URL contract. BPM-002..006, BPM-012.
 *
 * The corpus replay below is independent evidence: every assertion is checked against
 * requests the production plugin actually sent (tests/fixtures/respacio/search-calls.json).
 * A failure is a launch blocker — never re-baseline it.
 */

type Call = { id: number; params: Record<string, string | string[]>; total: number | null; ids: string[] }
const CALLS: Call[] = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures/search-calls.json'), 'utf8'),
)

describe('BPM-005 band hull', () => {
  it('collapses ₱1M–2M + ₱10M–20M to ₱1M–20M — a hull, not a union', () => {
    expect(bandHull(['1000000-2000000', '10000000-20000000'])).toEqual({ min: 1000000, max: 20000000 })
  })
  it('always sends min=0 when no lower bound is set', () => {
    expect(bandHull(['-5000000'])).toEqual({ min: 0, max: 5000000 })
  })
  it('an open "+" band resets the ceiling to 0 when it exceeds the running max', () => {
    expect(bandHull(['1000000-2000000', '50000000+'])).toEqual({ min: 1000000, max: 0 })
  })
  it('an open band below the running max leaves the max alone (the quirk, reproduced)', () => {
    expect(bandHull(['1000000-20000000', '5000000+'])).toEqual({ min: 1000000, max: 20000000 })
  })
  it('accepts the comma form', () => {
    expect(bandHull(['3,5'])).toEqual({ min: 3, max: 5 })
  })
})

describe('BPM-002 sort precedence', () => {
  it('?sortby beats the module config', () => expect(resolveSort('date_desc', 'priority_desc')).toBe('date_desc'))
  it('module config beats the fallback', () => expect(resolveSort(null, 'priority_desc')).toBe('priority_desc'))
  it('the hard-coded fallback is price_desc', () => expect(resolveSort(null)).toBe('price_desc'))
  it('CD-11: an unknown ?sortby never reaches the query (deliberate F-class fix)', () => {
    expect(resolveSort('yacht insurance companies', 'priority_desc')).toBe('priority_desc')
  })
})

describe('BPM-006 page size', () => {
  it('falls back to 9', () => expect(resolvePerPage(null, {})).toBe(9))
  it('?property_per_page overrides config', () => expect(resolvePerPage('12', { propertyPerPage: 8 })).toBe(12))
  it('…except on card_only layouts', () => expect(resolvePerPage('12', { propertyPerPage: 8, layout: 'card_only' })).toBe(8))
})

describe('BPM-003 direct bounds', () => {
  it('an encoded "+" (%2B) max is dropped — no ceiling', () => {
    const q = parseSearch(new URLSearchParams('min_price=5000000&max_price=100000000%2B'))
    expect(q.ranges.price).toEqual({ min: 5000000, max: null })
  })
  it('a raw "+" decodes to a space, as in PHP $_GET, so the ceiling is KEPT', () => {
    // strpos($v, '+') never sees it. Which form the live slider sends is pending: price-slider-plus.
    const q = parseSearch(new URLSearchParams('max_price=100000000+'))
    expect(q.ranges.price).toEqual({ min: 0, max: 100000000 })
  })
})

describe('PHP array params', () => {
  it('reads k, k[] and k[n] alike, dropping empties like array_filter', () => {
    expect(getAll(new URLSearchParams('type[]=_st_9&type[1]=_st_8&type=&x=1'), 'type')).toEqual(['_st_9', '_st_8'])
  })
})

describe('BPM-012 shortlist saved queries decode as captured', () => {
  it('Luxury Houses', () => {
    const q = parseSearch(new URLSearchParams('property_for=1&price=&min_price=19901000&max_price=100000000&type[]=_st_9'))
    expect(q).toMatchObject({ propertyFor: '1', subTypeIds: ['9'], ranges: { price: { min: 19901000, max: 100000000 } } })
  })
  it('Foreclosed (fa[] is an attribute id)', () => {
    expect(parseSearch(new URLSearchParams('property_for=1&sortby=priority_desc&fa[]=a143')).attributeIds).toEqual(['143'])
  })
  it('Preselling Condotels', () => {
    const q = parseSearch(new URLSearchParams('property_for=1&sale_detail_type[]=2&type[]=_st_94'))
    expect(q).toMatchObject({ saleDetailTypeIds: ['2'], subTypeIds: ['94'] })
  })
})

describe('corpus replay — the translation the plugin performed', () => {
  // Rebuild the public query the visitor sent from the CRM params, then check our
  // translation reproduces every facet param the plugin derived from it.
  const withType = CALLS.filter((c) => Object.keys(c.params).some((k) => k.startsWith('type[')))
  it(`type[]=_st_{n} -> sub_property_type[]={n} on all ${withType.length} calls`, () => {
    expect(withType.length).toBe(464)
    for (const c of withType) {
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(c.params)) if (k.startsWith('type[')) sp.append('type[]', String(v))
      const crm = toCrmParams(parseSearch(sp))
      const expected = Object.entries(c.params).filter(([k]) => k.startsWith('sub_property_type['))
      for (const [k, v] of expected) expect(crm[k], `call ${c.id} ${k}`).toBe(v)
    }
  })

  const withArea = CALLS.filter((c) => Object.keys(c.params).some((k) => k.startsWith('area[')))
  it(`area[]=city_{id} / municipality_{id} -> city[] / municipality[] on all ${withArea.length} calls`, () => {
    expect(withArea.length).toBe(686)
    for (const c of withArea) {
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(c.params)) if (k.startsWith('area[')) sp.append('area[]', String(v))
      const q = parseSearch(sp)
      const crmCity = Object.entries(c.params).filter(([k]) => /^city\[\d+\]$/.test(k)).map(([, v]) => v)
      const crmMun = Object.entries(c.params).filter(([k]) => /^municipality\[\d+\]$/.test(k)).map(([, v]) => v)
      if (crmCity.length) expect(q.townIds, `call ${c.id}`).toEqual(expect.arrayContaining(crmCity))
      if (crmMun.length) expect(q.municipalityIds, `call ${c.id}`).toEqual(expect.arrayContaining(crmMun))
    }
  })

  it('every order_by/order pair the corpus sent is the explode("_") of a sortby', () => {
    for (const c of CALLS.filter((c) => typeof c.params.sortby === 'string')) {
      const [orderBy, order] = String(c.params.sortby).split('_')
      expect(c.params.order_by, `call ${c.id}`).toBe(orderBy)
      if (order) expect(c.params.order, `call ${c.id}`).toBe(order)
    }
  })
})
