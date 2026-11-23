import { describe, expect, it } from 'vitest'

import { listingPath } from '@/lib/site/listing-path'

// BPM-007a: slugs.view keyed by property_for_id (respacio.php:286–316, search-results.php:1788–1806).
describe('BPM-007a view-page map', () => {
  const at = (propertyForId: string | null, rentAmountPeriod?: string) =>
    listingPath({ referenceNo: 'ZG1', propertyForId, rentAmountPeriod } as never)

  it('Sale and "Rent and Sale" go to /r/', () => {
    expect(at('1')).toBe('/r/ZG1/')
    expect(at('3')).toBe('/r/ZG1/') // no rent-to-buy page: falls back to the sale page
  })
  it('Rent, short and long rent go to /long-term/, with or without a rent period', () => {
    expect(at('2')).toBe('/long-term/ZG1/')
    expect(at('2', '')).toBe('/long-term/ZG1/') // the old interim sent this to /r/
    expect(at('4')).toBe('/long-term/ZG1/')
    expect(at('5')).toBe('/long-term/ZG1/')
  })
  it("the listing's own rent period does not choose the page", () => expect(at('1', 'month')).toBe('/r/ZG1/'))
  it('a missing property_for_id counts as Sale (:1670)', () => expect(at(null)).toBe('/r/ZG1/'))
  it("6 uses the request's property_for", () => {
    expect(listingPath({ referenceNo: 'ZG1', propertyForId: '6' } as never, '2')).toBe('/long-term/ZG1/')
    expect(listingPath({ referenceNo: 'ZG1', propertyForId: '6' } as never, '1')).toBe('/r/ZG1/')
  })
})
