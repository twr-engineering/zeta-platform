/**
 * Market rates (app PRD §7.2): one row per location and type (`groupsOf()`), and the trend
 * periods and points (`PERIOD`, `pIndex()`). Pure; names follow the reference build.
 */
import type { DealJSON } from './data'
import { confidence, type Confidence } from './filters'
import { refKey } from './deals'
import { median, MIN_DEALS, pct } from './stats'

export type Group = {
  /** `{locKey}|{typeKey}`: stable across renames, distinct for names not in Settings. */
  key: string
  locKey: string
  typeKey: string
  loc: string
  kind: 'Subdivision' | 'Zone' | ''
  type: string
  list: DealJSON[]
  n: number
  ok: boolean
  med: number
  p25: number
  p75: number
  conf: Confidence | null
}

/** Area rows last; then location name, then type name, by plain string order (JavaScript `<`). */
export function groupsOf(list: DealJSON[]): Group[] {
  const map = new Map<string, Group>()
  for (const d of list) {
    const locKey = refKey(d.location)
    const typeKey = refKey(d.type)
    const key = `${locKey}|${typeKey}`
    let g = map.get(key)
    if (!g) {
      g = { key, locKey, typeKey, loc: d.location.name, kind: d.location.kind, type: d.type.name, list: [], n: 0, ok: false, med: NaN, p25: NaN, p75: NaN, conf: null }
      map.set(key, g)
    }
    g.list.push(d)
  }
  const arr = [...map.values()]
  arr.sort((a, b) => {
    const ka = a.kind === 'Zone' ? 1 : 0
    const kb = b.kind === 'Zone' ? 1 : 0
    if (ka !== kb) return ka - kb
    return a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : a.type < b.type ? -1 : a.type > b.type ? 1 : 0
  })
  for (const g of arr) {
    const v = g.list.map((d) => d.pp)
    g.n = v.length
    g.ok = v.length >= MIN_DEALS
    g.med = median(v)
    g.p25 = pct(v, 0.25)
    g.p75 = pct(v, 0.75)
    g.conf = confidence(v)
  }
  return arr
}

// ---------- trend (§7.2.4) ----------

export type TrendBy = 'q' | 'h' | 'y'
export const PERIOD: Record<TrendBy, { per: number; show: number; word: string; label: (q: number) => string }> = {
  q: { per: 4, show: 8, word: 'quarter', label: (q) => `Q${(q % 4) + 1} ’${String(Math.floor(q / 4)).slice(2)}` },
  h: { per: 2, show: 6, word: 'half-year', label: (q) => `H${(q % 2) + 1} ’${String(Math.floor(q / 2)).slice(2)}` },
  y: { per: 1, show: 5, word: 'year', label: (q) => String(q) },
}

/** `pIndex(d, per)` = year × per + ⌊month / (12 / per)⌋, from an ISO calendar date (months 0–11). */
export function pIndex(date: string, per: number): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7)) - 1
  return y * per + Math.floor(m / (12 / per))
}

export type TrendPoint = { q: number; n: number; med: number | null }

/**
 * The periods to draw: the last `show` periods ending with the current one; a point needs 2 or
 * more deals. Leading empty periods are trimmed, keeping at least the last 2.
 */
export function trendPoints(list: DealJSON[], by: TrendBy, today: string): { pts: TrendPoint[]; cur: number } {
  const P = PERIOD[by]
  const cur = pIndex(today, P.per)
  let pts: TrendPoint[] = []
  for (let q = cur - P.show + 1; q <= cur; q++) {
    const v = list.filter((d) => pIndex(d.date, P.per) === q).map((d) => d.pp)
    pts.push({ q, n: v.length, med: v.length >= 2 ? median(v) : null })
  }
  const first = pts.findIndex((p) => p.n > 0)
  if (first > 0) pts = pts.slice(Math.min(first, pts.length - 2))
  return { pts, cur }
}

/** X-label step so labels never collide (R14): label i when (last − i) % step === 0. */
export const labelStep = (spacing: number) => Math.max(1, Math.ceil(58 / spacing))

/** Y range: floor(lo × 0.94 / 1000) × 1000 to ceil(hi × 1.06 / 1000) × 1000; equal ends get +1000. */
export function yRange(vals: number[]): [number, number] {
  const lo = Math.floor((Math.min(...vals) * 0.94) / 1000) * 1000
  let hi = Math.ceil((Math.max(...vals) * 1.06) / 1000) * 1000
  if (hi === lo) hi = lo + 1000
  return [lo, hi]
}
