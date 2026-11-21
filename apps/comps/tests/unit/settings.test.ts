import { describe, expect, it } from 'vitest'

import { resolveSeedDate } from '@/lib/seed-dates'
import { CATEGORIES, FORM_COPY, bandOf, checkPlace, checkType, cleanName, parsePin, pinOk, round6, savedToast, takenName } from '@/lib/settings'

const LIST = [
  { id: 1, name: 'Xavier Estates' },
  { id: 2, name: 'Centrio' },
]

describe('Settings rules (§7.5.5–7.5.6)', () => {
  it('cleans names: trims and collapses inner spaces', () => {
    expect(cleanName('  Alegria    Hills ')).toBe('Alegria Hills')
  })

  it('names the saved entry for a duplicate, ignoring case, but not the row being edited (R17)', () => {
    expect(takenName('xavier estates', LIST)).toBe('Xavier Estates')
    expect(takenName('xavier estates', LIST, 1)).toBe('')
  })

  it('checks a place in order: name, duplicate, center', () => {
    expect(checkPlace({ name: 'X', center: '' }, LIST)?.message).toBe('Enter the name of the subdivision or area.')
    expect(checkPlace({ name: 'CENTRIO', center: '' }, LIST)?.message).toBe('Centrio is already on the list.')
    expect(checkPlace({ name: 'New', center: '9.1, 124.6' }, LIST)).toEqual({
      field: 'center',
      message: 'Enter a map center inside Cagayan de Oro, for example 8.47000, 124.65000.',
    })
    expect(checkPlace({ name: 'New', center: '8.47 124.65' }, LIST)).toBeNull()
    expect(checkType({ name: ' ' }, LIST)?.message).toBe('Enter the name of the property type.')
  })

  it('parses pins and checks the CDO bounds inclusively (§8.6.2)', () => {
    expect(parsePin('8.48930, 124.66200')).toEqual({ lat: 8.4893, lng: 124.662 })
    expect(parsePin('see 8.4 124.7 here')).toEqual({ lat: 8.4, lng: 124.7 })
    expect(parsePin('nowhere')).toBeNull()
    expect(pinOk({ lat: 8.2, lng: 125.0 })).toBe(true)
    expect(pinOk({ lat: 8.81, lng: 124.6 })).toBe(false)
    expect(round6(8.4712345678)).toBe(8.471235)
  })

  it('writes one toast per save, "moved" replacing "renamed" (§7.5.5)', () => {
    expect(savedToast(null, 'Alegria Hills', 0)).toBe('Alegria Hills added')
    expect(savedToast('Centrio', 'Centrio', 11)).toBe('Centrio updated')
    expect(savedToast('Alegria Hills', 'Alegria Heights', 0)).toBe('Alegria Hills renamed to Alegria Heights')
    expect(savedToast('Xavier Estates', 'Xavier Estates Ph 1', 28)).toBe('28 deals moved to Xavier Estates Ph 1')
    expect(savedToast('Office unit', 'Office', 1)).toBe('1 deal moved to Office')
  })

  it('offers exactly the four categories, and no unit card for Agricultural (SET-008)', () => {
    expect(CATEGORIES).toEqual(['Residential', 'Commercial', 'Industrial', 'Agricultural'])
    expect(FORM_COPY.Agricultural.condo).toBeNull()
  })

  it('bands the price-basis area (§8.5)', () => {
    expect([bandOf(299), bandOf(300), bandOf(1000), bandOf(1001)]).toEqual(['u', 'm', 'm', 'o'])
  })
})

describe('seed dates (Appendix D.3)', () => {
  // 4 Nov 2026 in Manila: the current quarter starts 1 Oct 2026.
  const now = new Date('2026-11-04T03:00:00Z')
  it('resolves quarter-relative, fixed and today dates', () => {
    expect(resolveSeedDate({ q: 0, day: 1 }, now)).toBe('2026-10-01')
    expect(resolveSeedDate({ q: 1, day: 10 }, now)).toBe('2026-07-10')
    expect(resolveSeedDate({ q: 4, day: 1 }, now)).toBe('2025-10-01')
    expect(resolveSeedDate({ q: 10, day: 40 }, now)).toBe('2024-05-10')
    expect(resolveSeedDate({ abs: '2000-01-01' }, now)).toBe('2000-01-01')
    expect(resolveSeedDate({ today: true }, new Date('2026-11-04T17:00:00Z'))).toBe('2026-11-05') // Manila is UTC+8
  })
})
