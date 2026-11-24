import { describe, expect, it } from 'vitest'

import { cardCount, cardFloorArea, cardLotArea, cardRibbons, cardTypeLabel } from '../src/card'

// Live card scripts 297342.js, 298806.js, 285108.js (custom-css-js) — see src/card.ts.
describe('result-card figures', () => {
  it('bedrooms and bathrooms: empty, 0 and 0.00 show "-", anything else as is', () => {
    for (const v of ['', '0', '0.00', 0, null, undefined]) expect(cardCount(v)).toBe('-')
    expect(cardCount(3)).toBe('3')
    expect(cardCount('10')).toBe('10')
  })
  it('floor area: whole numbers below 1000, one decimal k below 10000 (keeping .0), whole k above', () => {
    expect(cardFloorArea(0)).toBe('-')
    expect(cardFloorArea('')).toBe('-')
    expect(cardFloorArea(173)).toBe('173')
    expect(cardFloorArea(140.6)).toBe('141')
    expect(cardFloorArea(1000)).toBe('1.0k')
    expect(cardFloorArea(1234)).toBe('1.2k')
    expect(cardFloorArea(12500)).toBe('13k')
    expect(cardFloorArea('1076.39')).toBe('1.1k') // imperial
  })
  it('lot area: k drops a trailing .0; hundreds with decimals round; smaller values as parsed', () => {
    expect(cardLotArea(0)).toBe('-')
    expect(cardLotArea(209)).toBe('209')
    expect(cardLotArea(1000)).toBe('1k')
    expect(cardLotArea(1200)).toBe('1.2k')
    expect(cardLotArea(12345)).toBe('12.3k')
    expect(cardLotArea('5,000')).toBe('5k')
    expect(cardLotArea(250.5)).toBe('251')
    expect(cardLotArea(45.5)).toBe('45.5')
  })
})

describe('card ribbons (template 276562)', () => {
  it('shows template keys in template order', () => {
    expect(cardRibbons('Rush Sale,Zeta Exclusive')).toEqual(['Zeta Exclusive', 'Rush Sale'])
    expect(cardRibbons('Direct Listing')).toEqual(['Direct Listing'])
  })
  it('Foreclosed and Preselling have no key, so no ribbon', () => {
    expect(cardRibbons('Foreclosed,Direct Listing')).toEqual(['Direct Listing'])
    expect(cardRibbons('Direct Listing,Preselling')).toEqual(['Direct Listing'])
    expect(cardRibbons(null)).toEqual([])
  })
})

describe('template 276562 .subtype — sub type, else sub-sub type (production 24 Nov 2026)', () => {
  it('shows the sub type when both exist', () => {
    expect(cardTypeLabel('House', 'Single Detached')).toBe('House')
    expect(cardTypeLabel('Commercial', 'Commercial Lot')).toBe('Commercial')
  })
  it('falls back to the sub-sub type', () => {
    expect(cardTypeLabel('', 'Studio')).toBe('Studio')
    expect(cardTypeLabel(null, 'Studio')).toBe('Studio')
  })
})
