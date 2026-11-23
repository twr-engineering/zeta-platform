import { describe, expect, it } from 'vitest'

import { displayArea, parseMeasurement, sqmToSqft } from '../src/area'

// FR-G05: convertSquareMetersToSquareFeet (newrespacio-child/functions.php:3843–3850).
describe('sqm → sqft', () => {
  it('multiplies by 10.7639 and formats to 2 decimals', () => {
    expect(sqmToSqft(100)).toBe('1076.39')
    expect(sqmToSqft(500)).toBe('5381.95')
    expect(sqmToSqft('45')).toBe('484.38') // 484.3755 → half-up
  })
  it('a zero, negative, empty or non-numeric area becomes 0.00', () => {
    for (const v of [0, -5, '', null, undefined, 'n/a']) expect(sqmToSqft(v)).toBe('0.00')
  })
  it('no thousands separator', () => expect(sqmToSqft(1000)).toBe('10763.90'))
  it('imperial switches the unit; metric passes through', () => {
    expect(displayArea(200, 'imperial')).toEqual({ value: '2152.78', unit: 'sqft' })
    expect(displayArea(200, 'metric')).toEqual({ value: '200', unit: 'sqm' })
  })
  it('only "imperial" means imperial', () => {
    expect(parseMeasurement('imperial')).toBe('imperial')
    expect(parseMeasurement('IMPERIAL')).toBe('metric')
    expect(parseMeasurement(undefined)).toBe('metric')
  })
})
