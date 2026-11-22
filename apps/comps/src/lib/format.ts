/**
 * Formatting rules for every screen (app PRD §6.7), ported from the reference build's
 * peso(), pesoShort(), fmtDate(), fmtMonth(), pinText() and the radius label.
 */

/** Three-letter months everywhere. Never "Sept" (regression R16). */
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** ₱ + whole pesos with en-US commas: 26450.5 → "₱26,451". */
// One shared formatter: toLocaleString builds a new one on every call, which costs ~0.03 ms per
// number and adds up to hundreds of ms over thousands of map markers (NFR-002).
const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
export const peso = (n: number): string => '₱' + WHOLE.format(Math.round(n))

/** ≥ 1,000,000 → "₱21.5M" (2 decimals, trailing zeros and point removed); otherwise peso(). */
export const pesoShort = (n: number): string =>
  n >= 1_000_000 ? '₱' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M' : peso(n)

/** Rounded area with commas and " sqm"; missing → en dash. */
export const sqm = (n: number | null | undefined): string =>
  n ? Math.round(n).toLocaleString('en-US') + ' sqm' : '–'

type YMD = { y: number; m: number; d: number }

/** Accepts an ISO calendar date ("2026-09-03") or a Date (read in Asia/Manila). */
const parts = (value: string | Date): YMD => {
  if (typeof value === 'string') {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number)
    return { y, m: m - 1, d }
  }
  const [y, m, d] = manilaISO(value).split('-').map(Number)
  return { y, m: m - 1, d }
}

/** "3 Sep 2026": day without leading zero, three-letter month, year. */
export const fmtDate = (value: string | Date): string => {
  const { y, m, d } = parts(value)
  return `${d} ${MON[m]} ${y}`
}

/** "Sep 2026". */
export const fmtMonth = (value: string | Date): string => {
  const { y, m } = parts(value)
  return `${MON[m]} ${y}`
}

/** Map pin to 5 decimals: "8.48930, 124.66200". */
export const pinText = (lat: number, lng: number): string => lat.toFixed(5) + ', ' + lng.toFixed(5)

/** Distance label: "250 m", "1 km", "1.25 km", "1.5 km". */
export const distanceLabel = (metres: number): string =>
  metres >= 1000 ? (metres / 1000).toFixed(metres % 1000 ? 2 : 0).replace(/0$/, '') + ' km' : metres + ' m'

/**
 * Today's calendar date in Asia/Manila (UTC+8, no DST), as YYYY-MM-DD. Every "today",
 * period and date check uses this, in the browser and on the server (NFR-006).
 */
export const manilaISO = (at: Date = new Date()): string => {
  const shifted = new Date(at.getTime() + 8 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}
