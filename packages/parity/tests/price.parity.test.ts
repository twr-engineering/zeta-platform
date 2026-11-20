import { describe, expect, it } from 'vitest'

import { formatPrice } from '../src/price'

/**
 * BPM-008 price display. These are regression guards derived from format_price's source,
 * NOT live observations — the exact ICU output is pending (price-display-live). Replace the
 * expected strings with values copied from production when that check runs.
 */
const RATES = { EUR: '1.0000000000', USD: '1.1687567934', PHP: '72.1823096972' }

describe('format_price', () => {
  it('same currency: unconverted, zero decimals, code replaced by symbol', () => {
    expect(formatPrice(8_000_000, 'PHP', 'PHP', RATES).price).toBe('₱ 8,000,000')
  })
  it('an empty display currency renders nothing — `!empty($currency_converter->{""})` fails first', () => {
    expect(formatPrice(8_000_000, 'PHP', '', RATES).price).toBe('')
  })
  it('alternates round to the nearest hundred', () => {
    // 8,000,000 / 72.18… = 110,830.6… -> 110,800
    expect(formatPrice(8_000_000, 'PHP', 'PHP', RATES).alternates.EUR).toBe('€ 110,800')
  })
  it('cross-currency headline: × display ÷ stored, nearest ten, "Appx."', () => {
    // 8,000,000 × 1.1687… / 72.18… = 129,533.0… -> 129,530
    expect(formatPrice(8_000_000, 'PHP', 'USD', RATES)).toMatchObject({ price: 'Appx. $ 129,530', approximate: true })
  })
  it('renders nothing for a non-numeric amount or a display currency with no rate', () => {
    expect(formatPrice(null, 'PHP', 'PHP', RATES).price).toBe('')
    expect(formatPrice(1, 'PHP', 'GBP', RATES).price).toBe('')
  })
})
