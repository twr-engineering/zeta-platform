import { describe, expect, it } from 'vitest'

import { attributeRows, featureList, newDevelopmentDescription, priceHistoryRows } from '../src/listing'

describe('BPM-020 New Development description (spv:495–516)', () => {
  it('rewrites [Label: a - b] before the last "]." for sale detail 2 only', () => {
    const d = 'Lot area [Lot Area: 150 - 300]. Floor [Floor Area: 80]. Nice.'
    expect(newDevelopmentDescription(d, '2')).toBe('Lot area Lot Area from 150 to 300.. Floor Floor Area : 80.. Nice.')
    expect(newDevelopmentDescription(d, '1')).toBe(d)
  })
  it('only brackets up to the last "]." count', () => {
    expect(newDevelopmentDescription('[A: 1 - 2]. tail [B: 3]', '2')).toBe('A from 1 to 2.. tail [B: 3]')
  })
})

describe('BPM-020 price history (spv:2169–2229)', () => {
  it('j M Y, rounded % change with direction, raw previous price', () => {
    expect(priceHistoryRows([{ price_change_date: '2025-03-05 10:00:00', old_price: '₱5500000.00', new_price: '₱5000000.00' }])).toEqual([
      { date: '5 Mar 2025', direction: 'down', percent: 9, previous: '₱5500000.00' },
    ])
  })
  it('skips rows missing a price; empty → null ("not found")', () => {
    expect(priceHistoryRows([{ price_change_date: '2025-01-01', old_price: '', new_price: '1' }])).toEqual([])
    expect(priceHistoryRows([])).toBeNull()
  })
})

describe('BPM-020 features and attribute rows (spv:1258–1302, T:487–596)', () => {
  const attributes = [
    { name: 'Pool', Pool: { '4': 'Community Pool' } },
    { name: 'Furnishing', Furnishing: { '100': 'Fully Finished' } },
    { name: 'Views', Views: { '132': 'Sea', '145': 'Beachfront' } },
  ]
  const features = [{ name: 'Community', Community: { '109': 'Swimming Pool', '110': 'Community Pool' } }, { name: 'Transport', Transport: { '102': 'Good Road Access' } }]
  it('features: symmetric difference, attributes first, each sorted and lower-cased', () => {
    expect(featureList(attributes, features)).toEqual(['beachfront', 'fully finished', 'sea', 'good road access', 'swimming pool'])
    expect(featureList([], features)).toEqual(['community pool', 'good road access', 'swimming pool'])
  })
  it('attribute rows show only when an id matches; Beachfront is not a View', () => {
    expect(attributeRows(attributes)).toEqual([
      { label: 'Pool', values: ['Community Pool'] },
      { label: 'Furnishing', values: ['Fully Finished'] },
      { label: 'View', values: ['Sea'] },
    ])
  })
})

describe('BPM-010 similar price band', async () => {
  const { similarPriceBounds } = await import('../src/listing')
  it('±40%, rounded (verified against the cache: 6.8M → 4.08M / 9.52M)', () => expect(similarPriceBounds(6800000)).toEqual({ min: 4080000, max: 9520000 }))
})
