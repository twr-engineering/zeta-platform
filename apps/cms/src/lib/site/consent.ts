/**
 * FR-G10 / NFR-C03 — cookie consent. Necessary cookies (session, display currency, units) need no
 * consent; analytics and marketing tags load only once their category is accepted. The choice is a
 * first-party cookie so the server renders the right tags on the first paint (no flash, FR-G12).
 * Bump CONSENT_VERSION when the categories change: older choices are then asked again.
 */
export const CONSENT_COOKIE = 'zeta_consent'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180 // six months, then ask again
export const OPEN_CONSENT_EVENT = 'zeta:open-cookie-settings'

export type ConsentCategory = 'analytics' | 'marketing'
export type Consent = { v: number; analytics: boolean; marketing: boolean }

/** null = no valid choice yet (missing, malformed, or an older version). */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as Partial<Consent>
    if (c.v !== CONSENT_VERSION) return null
    return { v: CONSENT_VERSION, analytics: c.analytics === true, marketing: c.marketing === true }
  } catch {
    return null
  }
}

export function serializeConsent(c: Omit<Consent, 'v'>): string {
  return encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, analytics: c.analytics, marketing: c.marketing }))
}

export type TrackingIds = { gaMeasurementId?: string | null; metaPixelId?: string | null }

/** The categories that actually have a tag configured. No categories → no banner. */
export function activeCategories(t: TrackingIds): ConsentCategory[] {
  const out: ConsentCategory[] = []
  if (t.gaMeasurementId?.trim()) out.push('analytics')
  if (t.metaPixelId?.trim()) out.push('marketing')
  return out
}

/** Tag IDs are interpolated into inline script: allow only the formats the vendors issue. */
export const GA_ID = /^G-[A-Z0-9]{4,16}$/
export const PIXEL_ID = /^\d{6,20}$/
