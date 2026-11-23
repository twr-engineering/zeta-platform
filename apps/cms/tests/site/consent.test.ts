import { describe, expect, it } from 'vitest'

import { activeCategories, CONSENT_VERSION, GA_ID, parseConsent, PIXEL_ID, serializeConsent } from '@/lib/site/consent'

describe('cookie consent (FR-G10)', () => {
  it('round-trips a choice', () => {
    expect(parseConsent(serializeConsent({ analytics: true, marketing: false }))).toEqual({ v: CONSENT_VERSION, analytics: true, marketing: false })
  })
  it('treats missing, malformed and old-version choices as no choice', () => {
    expect(parseConsent(undefined)).toBeNull()
    expect(parseConsent('not json')).toBeNull()
    expect(parseConsent(encodeURIComponent(JSON.stringify({ v: 0, analytics: true, marketing: true })))).toBeNull()
  })
  it('only an explicit true grants a category', () => {
    expect(parseConsent(encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, analytics: 'yes', marketing: 1 })))).toEqual({ v: CONSENT_VERSION, analytics: false, marketing: false })
  })
  it('a category is active only when its tag is configured', () => {
    expect(activeCategories({})).toEqual([])
    expect(activeCategories({ gaMeasurementId: ' ' })).toEqual([])
    expect(activeCategories({ gaMeasurementId: 'G-ABC1234', metaPixelId: '123456789' })).toEqual(['analytics', 'marketing'])
  })
  it('tag IDs must match the vendor formats before they reach inline script', () => {
    expect(GA_ID.test('G-ABC1234')).toBe(true)
    expect(GA_ID.test("G-1');alert(1)//")).toBe(false)
    expect(PIXEL_ID.test('123456789')).toBe(true)
    expect(PIXEL_ID.test('12345abc')).toBe(false)
  })
})
