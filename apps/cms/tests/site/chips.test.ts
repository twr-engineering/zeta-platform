import { describe, expect, it } from 'vitest'

import { filterChips } from '@/lib/search/chips'

describe('filter chips (FR-SR12)', () => {
  const chips = (qs: string) => filterChips(new URLSearchParams(qs))
  it('labels each applied filter from the captured options', () => {
    const c = chips('property_for=1&type[]=_st_9&type[]=_sst_39&min_bedroom=3&fa[]=a132&fa[]=a143&sale_detail_type[]=2&q=Xavier')
    expect(c.map((x) => x.label)).toEqual(['“Xavier”', 'House', 'Studio', '3+ bedrooms', 'New Development', 'Sea view', 'Foreclosed: Yes'])
  })
  it('removing a chip keeps the rest and resets pageid', () => {
    const house = chips('property_for=1&type[]=_st_9&type[]=_st_38&pageid=4').find((x) => x.label === 'House')!
    const next = new URLSearchParams(house.href.split('?')[1])
    expect(next.getAll('type[]')).toEqual(['_st_38'])
    expect(next.get('pageid')).toBe('1')
    expect(next.get('property_for')).toBe('1')
  })
  it('price is one chip; "above ₱100M" reads as such', () => {
    expect(chips('min_price=1000&max_price=5000000').map((x) => x.label)).toEqual(['₱1,000 – ₱5,000,000'])
    expect(chips('price=&min_price=100000000&max_price=1000000000').map((x) => x.label)).toEqual(['Above ₱100,000,000'])
    const next = new URLSearchParams(chips('min_price=1000&max_price=5000000')[0].href.split('?')[1])
    expect(next.has('min_price') || next.has('max_price')).toBe(false)
  })
  it('property_for and sortby are not chips', () => expect(chips('property_for=2&sortby=price_asc')).toEqual([]))
})
