/** Percentiles as in the reference build's pct() (app PRD §8.2, §17.4): linear interpolation. */
export function pct(values: number[], p: number): number {
  return pctSorted(values.slice().sort((a, b) => a - b), p)
}

/** pct() on values already sorted ascending: several percentiles from one sort (NFR-002). */
export function pctSorted(s: number[], p: number): number {
  if (!s.length) return NaN
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}

export const median = (values: number[]): number => pct(values, 0.5)

/** The 5-deal rule (§8.1, BR-001): nothing is shown from fewer deals. */
export const MIN_DEALS = 5

/** Great-circle distance in metres (§8.14). */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toR = Math.PI / 180
  const dLat = (b.lat - a.lat) * toR
  const dLng = (b.lng - a.lng) * toR
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
