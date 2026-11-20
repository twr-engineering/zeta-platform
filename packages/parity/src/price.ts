/**
 * Price display — FR-G03 / FR-G04 / FR-G06.
 *
 * CAPTURED. See WP-00-behavioural-parity-matrix.md, BPM-008.
 * Source: plugins/respacio/includes/functions.php:8926 (format_price).
 *
 * Rules, as built:
 *   - Conversion happens at display time, never before. Filtering uses stored values.
 *   - Rates are the CRM's EUR-based `currency_converter` (CrmState global). No other FX source.
 *   - Zero fraction digits, always (NumberFormatter FRACTION_DIGITS = 0).
 *   - Same-currency display: the amount is formatted unconverted.
 *   - Cross-currency display: amount × rate[display] ÷ rate[stored], rounded to the nearest
 *     TEN (round(…, -1)), prefixed "Appx.".
 *   - The alternative-currency figures (propriceappx) round to the nearest HUNDRED (-2).
 *   - Display currency resolves ?currency= -> cookie `form_displaycurrency` -> first configured.
 *
 * PHP's round() is half-away-from-zero; Math.round is half-up. Prices are positive, so the
 * two agree here — do not "fix" this to banker's rounding.
 */

export type Rates = Record<string, string | number>

export const DISPLAY_CURRENCY_COOKIE = 'form_displaycurrency'

/** The four branches format_price substitutes. Anything else falls through (CD-03, `¤`). */
const SYMBOLS: Record<string, string> = { EUR: '€ ', USD: '$ ', GBP: '£ ', PHP: '₱ ' }

const phpRound = (n: number, precision: number) => {
  const f = 10 ** -precision
  return Math.sign(n) * Math.round(Math.abs(n) / f) * f
}

function formatCurrency(amount: number, code: string): string {
  const s = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
  // ICU emits "PHP 8,000,000" with currencyDisplay:'code'; format_price then str_replaces the
  // code with its symbol + space. Normalising the ICU non-breaking space keeps that exact.
  // The exact server ICU output is unverified (pending: price-display-live).
  const normalised = s.replace(/ /g, ' ')
  return SYMBOLS[code] ? normalised.replace(`${code} `, SYMBOLS[code]) : normalised
}

export type FormattedPrice = {
  /** The headline price string. Empty when format_price would render nothing. */
  price: string
  approximate: boolean
  /** Other-currency approximations, keyed by currency code. */
  alternates: Record<string, string>
}

export function formatPrice(
  amount: number | null | undefined,
  storedCurrency: string,
  displayCurrency: string,
  rates: Rates,
): FormattedPrice {
  const rate = (c: string) => Number(rates[c])
  // `is_numeric($pro_amount) && !empty($currency_converter->$displaycurrency)`
  if (amount === null || amount === undefined || !Number.isFinite(amount) || !rate(displayCurrency)) {
    return { price: '', approximate: false, alternates: {} }
  }

  if (storedCurrency in SYMBOLS && (displayCurrency === storedCurrency || displayCurrency === '')) {
    const alternates: Record<string, string> = {}
    for (const ck of Object.keys(rates)) {
      if (ck === storedCurrency) continue
      const inEur = storedCurrency === 'EUR' ? amount : amount / rate(storedCurrency)
      const value = ck === 'EUR' ? inEur : inEur * rate(ck)
      // The EUR-stored branch does not round its alternates; the others round to -2.
      alternates[ck] = formatCurrency(storedCurrency === 'EUR' ? value : phpRound(value, -2), ck)
    }
    return { price: formatCurrency(amount, storedCurrency), approximate: false, alternates }
  }

  if (rate(storedCurrency)) {
    const converted = phpRound((amount * rate(displayCurrency)) / rate(storedCurrency), -1)
    return { price: `Appx. ${formatCurrency(converted, displayCurrency)}`, approximate: true, alternates: {} }
  }
  return { price: '', approximate: false, alternates: {} }
}
