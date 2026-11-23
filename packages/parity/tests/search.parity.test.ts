import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { deviceType } from '../src/search/device'
import { bandHull, getAll, parseSearch, resolveKeyword, resolvePerPage, resolveSort, toCrmParams } from '../src/search/params'

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

describe('BPM-006a phone page size (search-results.php:730–738, block defaults)', () => {
  it('a phone gets the block default 9 when the module sets no phone size, whatever the desktop size', () => {
    expect(resolvePerPage(null, { propertyPerPage: 12, device: 'Phone' })).toBe(9) // /search_results/, shortlists
    expect(resolvePerPage(null, { propertyPerPage: 8, device: 'Phone' })).toBe(9) // City/Municipality Middle
    expect(resolvePerPage(null, { propertyPerPage: 30, device: 'Phone' })).toBe(9) // Complex Middle
  })
  it("a module's explicit phone size wins on a phone only", () => {
    expect(resolvePerPage(null, { propertyPerPage: 4, propertyPerPagePhone: 3, device: 'Phone' })).toBe(3) // /r/ similar
    expect(resolvePerPage(null, { propertyPerPage: 4, propertyPerPagePhone: 3, device: 'Tablet' })).toBe(4)
    expect(resolvePerPage(null, { propertyPerPage: 4, propertyPerPagePhone: 3, device: 'Computer' })).toBe(4)
  })
  it('?property_per_page still overrides on a phone', () =>
    expect(resolvePerPage('12', { propertyPerPagePhone: 3, device: 'Phone' })).toBe(12))
  it('a tablet is not a phone (detect.php:66–68)', () => {
    expect(deviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('Phone')
    expect(deviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe('Phone')
    expect(deviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148')).toBe('Tablet')
    expect(deviceType('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe('Tablet')
    expect(deviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15')).toBe('Computer')
    expect(deviceType(null)).toBe('Computer')
  })
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

describe('BPM-016 keyword field (search-results.php:464–500)', () => {
  const kw = (qs: string) => resolveKeyword(new URLSearchParams(qs))
  it('reads keyword_1, the live field, for Sale or no property_for', () => {
    expect(kw('keyword_1=ZTP73')).toBe('ZTP73')
    expect(kw('property_for=1&keyword_1=ZTP73')).toBe('ZTP73')
  })
  it('drops a suffix that does not match ?property_for', () => {
    expect(kw('property_for=2&keyword_1=ZTP73')).toBeNull()
    expect(kw('property_for=2&keyword_2=ZTP73')).toBe('ZTP73')
    expect(kw('property_for=6&keyword_1=ZTP73')).toBe('ZTP73') // only 1–5 are excluded
  })
  it('keyword_5 is never a keyword: its suffix is not stripped', () => expect(kw('property_for=5&keyword_5=ZTP73')).toBeNull())
  it('a bare keyword always counts; empty values are skipped; the value is raw', () => {
    expect(kw('property_for=2&keyword=ztp 7')).toBe('ztp 7')
    expect(kw('keyword=')).toBeNull()
  })
})

describe('BPM-021 search form params', () => {
  const q = (qs: string) => parseSearch(new URLSearchParams(qs))
  it('splits type[] into sub-types (_st_) and sub-sub-types (_sst_)', () => {
    const r = q('type[]=_st_9&type[]=_sst_39')
    expect(r.subTypeIds).toEqual(['9'])
    expect(r.subSubTypeIds).toEqual(['39'])
    expect(toCrmParams(r)).toMatchObject({ 'sub_property_type[0]': '9', 'sub_sub_property_type[0]': '39' })
  })
  it('reads the More Filters area boxes as min_/max_ bounds', () => {
    const r = q('min_plot_size=200&max_plot_size=500&min_total_built_size=80')
    expect(r.ranges.plot_size).toEqual({ min: 200, max: 500 })
    expect(r.ranges.total_built_size).toEqual({ min: 80, max: null })
  })
  it('storey: the first min_storey[]; "5+" sanitises to 5', () => {
    expect(q('min_storey[]=3').minStorey).toBe(3)
    expect(q('min_storey[]=5%2B').minStorey).toBe(5)
    expect(q('').minStorey).toBeNull()
  })
  it('year built range and payment terms are carried', () => {
    expect(q('min_built_year=2010').builtYear).toEqual({ min: 2010, max: null })
    expect(q('payment_terms[]=Cash&payment_terms[]=Bank+Financing').paymentTerms).toEqual(['Cash', 'Bank Financing'])
  })
  it('the "above ₱100M" checkbox is a plain range (×10 ceiling)', () =>
    expect(q('price=&min_price=100000000&max_price=1000000000').ranges.price).toEqual({ min: 100000000, max: 1000000000 }))
})

describe('BPM-021 form helpers', async () => {
  const { toggleType, withParam } = await import('../src/search/form')
  it('ticking a parent clears its children; ticking a child clears its parent', () => {
    expect(toggleType(['_sst_39', '_sst_45'], '_st_38')).toEqual(['_st_38'])
    expect(toggleType(['_st_9'], '_sst_44')).toEqual(['_sst_44'])
    expect(toggleType(['_st_9', '_st_38'], '_st_9')).toEqual(['_st_38'])
  })
  it('every control resets pageid to 1 and replaces its own key', () => {
    const sp = new URLSearchParams('property_for=1&type[]=_st_9&pageid=3')
    expect(withParam(sp, 'type', ['_st_38']).toString()).toBe('property_for=1&pageid=1&type%5B%5D=_st_38')
    expect(withParam(sp, 'min_bedroom', '3').get('min_bedroom')).toBe('3')
    expect(withParam(sp, 'type', null).has('type[]')).toBe(false)
  })
})
