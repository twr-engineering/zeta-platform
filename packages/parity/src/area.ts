/**
 * FR-G05 / FR-G06 — the metric/imperial switch. CAPTURED: do not "improve".
 *
 * Source: child theme `newrespacio-child/functions.php:3810–3850`. The live header's apply_currency
 * handler stores `measurement` in the PHP session; templates switch the unit to sqft when it is
 * "imperial" (single-property-view.php:403–408, functions.php:3524) and convert with
 * convertSquareMetersToSquareFeet: × 10.7639, number_format to 2 decimals, and 0 → "0.00"
 * (a non-positive area is not converted, it becomes 0).
 */
export type Measurement = 'metric' | 'imperial'
export const SQFT_PER_SQM = 10.7639
export const MEASUREMENT_COOKIE = 'measurement'

export function sqmToSqft(squareMeters: number | string | null | undefined): string {
  const sqm = Number(squareMeters)
  const sqft = Number.isFinite(sqm) && sqm > 0 ? sqm * SQFT_PER_SQM : 0
  // number_format($x, 2, '.', ''): half-up at 2 decimals, no thousands separator.
  return (Math.round((sqft + Number.EPSILON) * 100) / 100).toFixed(2)
}

/** The area figure and unit as the templates print them. Metric passes the value through. */
export function displayArea(squareMeters: number | string | null | undefined, measurement: Measurement): { value: string; unit: 'sqm' | 'sqft' } {
  if (measurement === 'imperial') return { value: sqmToSqft(squareMeters), unit: 'sqft' }
  return { value: squareMeters == null ? '' : String(squareMeters), unit: 'sqm' }
}

export function parseMeasurement(v: string | null | undefined): Measurement {
  return v === 'imperial' ? 'imperial' : 'metric'
}
