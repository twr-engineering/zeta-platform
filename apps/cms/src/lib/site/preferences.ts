'use server'

import { cookies } from 'next/headers'

import { MEASUREMENT_COOKIE, parseMeasurement } from '@zeta/parity/area'
import { DISPLAY_CURRENCY_COOKIE } from '@/lib/price'

import { CURRENCIES } from './currencies'

/**
 * FR-G02/G03/G05/G06 — the drawer's currency and unit switch. Currency keeps BPM-008's cookie
 * (form_displaycurrency, read server-side so the first paint is right: FR-G12). The unit mirrors the
 * live `measurement` session value (functions.php:3824) as a session cookie.
 */
export async function setPreferences(formData: FormData) {
  const jar = await cookies()
  const currency = String(formData.get('currency') ?? '')
  if ((CURRENCIES as readonly string[]).includes(currency)) {
    jar.set(DISPLAY_CURRENCY_COOKIE, currency, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  }
  const measurement = formData.get('measurement')
  if (measurement !== null) jar.set(MEASUREMENT_COOKIE, parseMeasurement(String(measurement)), { path: '/', sameSite: 'lax' })
}
