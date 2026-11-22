/**
 * Closed deals and Market rates list rules (app PRD §6.3, §7.1.2–7.1.6, §8.3, §8.7, §8.15):
 * the filter bar, the Filters sheet definitions (FDEFS), search, sort, slider ranges and
 * confidence. Pure functions over the §14.3 deal objects; function names follow the
 * reference build so the two can be compared.
 */
import type { DealJSON, TypeJSON } from './data'
import { FIN_OPTS, FURN_OPTS, COND_OPTS, LEGACY_TYPE, hasFurnish, hasRooms, refKey, type TypeInfo } from './deals'
import { MIN_DEALS, pctSorted } from './stats'

// ---------- filter bar (§6.3) ----------

export const PERIODS = [
  ['3', 'Last 3 months'],
  ['6', 'Last 6 months'],
  ['12', 'Last 12 months'],
  ['24', 'Last 24 months'],
  ['9999', 'Any time'],
] as const
export const DEFAULT_PERIOD = '24'

/** `months(d)`: (today − d) / 30.44 days, both calendar dates in Asia/Manila (§8.15). */
export function months(date: string, today: string): number {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000
  return days / 30.44
}

/**
 * The earliest date inside "sold within N months" (NFR-002: one date per filter change instead of
 * parsing every deal's date). months(d) <= N ⇔ days(d) <= 30.44·N; deal dates are whole days, so
 * the cutoff is today − ⌊30.44·N⌋ days, and `date >= cutoff` (ISO strings sort as dates) is exact.
 */
export function periodCutoff(today: string, n: number): string {
  if (n >= 9999) return '0000-01-01'
  const t = Date.parse(`${today}T00:00:00Z`) - Math.floor(30.44 * n) * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** Filter-bar keys of a deal's place and type: refKey (`id:5`, or `name:…` for a name not in Settings). */
export const locKeyOf = (d: DealJSON) => refKey(d.location)
export const typeKeyOf = (d: DealJSON) => refKey(d.type)

/** The capabilities of the type picked in the bar: Settings row, or a name not in Settings (a Residential house). */
export function typeInfoOf(typeKey: string, types: TypeJSON[]): TypeInfo | null {
  if (!typeKey) return null
  const t = types.find((x) => `id:${x.id}` === typeKey)
  return t ? { form: t.form, category: t.category } : LEGACY_TYPE
}

// ---------- the Filters sheet (§7.1.6) ----------

export type Range = [number, number]
export type FxValue = string | Range
export type Fx = Partial<Record<FKey, FxValue>>
export type FKey = 'larea' | 'farea' | 'band' | 'fin' | 'front' | 'feat' | 'terrain' | 'beds' | 'cbeds' | 'baths' | 'park' | 'cpark' | 'cond' | 'furn' | 'floor'
type When = 'all' | 'notype' | 'lotOrHouse' | 'built' | 'lot' | 'house' | 'condo' | 'houseRooms' | 'rooms' | 'furnish'

export type FDef = {
  k: FKey
  label: string
  sub?: string
  when: When
  kind: 'range' | 'choice' | 'select'
  /** [value, label]; a select's first option is "Any" (''). Choice buttons have no "Any". */
  opts?: readonly (readonly [string, string])[]
  /** The value a slider reads from a deal (lots: area; houses: lotArea…). */
  range?: (d: DealJSON) => number | null
  test?: (d: DealJSON, v: string) => boolean
}

/** Exact count, except the last choice, which means that many or more. */
const exactOrMore = (pick: (d: DealJSON) => number | null, top: number) => (d: DealJSON, v: string) => {
  const x = pick(d)
  if (x === null || x === undefined) return false
  const n = Number(v)
  return n >= top ? x >= top : x === n
}
const bandIn = (pick: (d: DealJSON) => number | null, lo: number, hi: number) => (d: DealJSON, v: string) => {
  const x = pick(d)
  if (!(x && x > 0)) return false
  return v === 'a' ? x < lo : v === 'b' ? x >= lo && x <= hi : x > hi
}
const any = (opts: readonly (readonly [string, string])[]) => [['', 'Any'] as const, ...opts]

export const FDEFS: readonly FDef[] = [
  { k: 'larea', label: 'Lot area (sqm)', when: 'lotOrHouse', kind: 'range', range: (d) => (d.type.form === 'lot' ? d.area : d.lotArea) },
  { k: 'farea', label: 'Floor area (sqm)', when: 'built', kind: 'range', range: (d) => (d.type.form === 'lot' ? null : d.area) },
  { k: 'band', label: 'Size (sqm)', sub: 'lot area for lots, floor area for the rest', when: 'notype', kind: 'choice', opts: [['u', 'Under 300'], ['m', '300 to 1,000'], ['o', 'Over 1,000']], test: (d, v) => d.band === v },
  { k: 'fin', label: 'Mode of payment', when: 'all', kind: 'select', opts: any(FIN_OPTS), test: (d, v) => d.fin === v },
  { k: 'front', label: 'Frontage', when: 'lot', kind: 'choice', opts: [['a', 'Under 15 m'], ['b', '15 to 25 m'], ['c', 'Over 25 m']], test: bandIn((d) => d.frontage, 15, 25) },
  { k: 'feat', label: 'Lot features', when: 'lot', kind: 'choice', opts: [['corner', 'Corner lot'], ['ridge', 'Ridge view']], test: (d, v) => (v === 'corner' ? d.corner : d.view === 'Ridge view') },
  { k: 'terrain', label: 'Terrain and shape', when: 'lot', kind: 'choice', opts: [['Flat', 'Flat'], ['Sloped', 'Sloped'], ['Irregular', 'Irregular']], test: (d, v) => d.terrain === v },
  { k: 'beds', label: 'Bedrooms', when: 'houseRooms', kind: 'choice', opts: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5+']], test: exactOrMore((d) => d.beds, 5) },
  { k: 'cbeds', label: 'Bedrooms', when: 'condo', kind: 'choice', opts: [['0', 'Studio'], ['1', '1BR'], ['2', '2BR'], ['3', '3BR+']], test: exactOrMore((d) => d.beds, 3) },
  { k: 'baths', label: 'Bathrooms', when: 'rooms', kind: 'choice', opts: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4+']], test: exactOrMore((d) => d.baths, 4) },
  { k: 'park', label: 'Parking slots', when: 'house', kind: 'choice', opts: [['0', 'None'], ['1', '1'], ['2', '2'], ['3', '3+']], test: exactOrMore((d) => d.parking, 3) },
  { k: 'cpark', label: 'Parking slots', when: 'condo', kind: 'choice', opts: [['0', 'None'], ['1', '1'], ['2', '2+']], test: exactOrMore((d) => d.parking, 2) },
  { k: 'cond', label: 'Condition', when: 'house', kind: 'select', opts: any(COND_OPTS), test: (d, v) => d.cond === v },
  { k: 'furn', label: 'Furnishing', when: 'furnish', kind: 'select', opts: any(FURN_OPTS), test: (d, v) => d.furn === v },
  {
    k: 'floor', label: 'Floor level', when: 'condo', kind: 'choice', opts: [['a', '1 to 10'], ['b', '11 to 20'], ['c', '21 and up']],
    test: (d, v) => (!d.floor ? false : v === 'a' ? d.floor <= 10 : v === 'b' ? d.floor > 10 && d.floor <= 20 : d.floor > 20),
  },
]

/** `fitsType()`: which filters show for the type picked in the bar (null: Any type). */
export function fitsType(def: FDef, t: TypeInfo | null): boolean {
  if (def.when === 'all') return true
  if (def.when === 'notype') return !t
  if (!t) return false
  switch (def.when) {
    case 'furnish': return hasFurnish(t)
    case 'lotOrHouse': return t.form !== 'condo'
    case 'built': return t.form !== 'lot'
    case 'lot': return t.form === 'lot'
    case 'house': return t.form === 'house'
    case 'condo': return t.form === 'condo'
    case 'houseRooms': return t.form === 'house' && hasRooms(t)
    case 'rooms': return hasRooms(t)
  }
}

const RANK = { range: 0, choice: 1, select: 2 } as const
/** The sheet's sections: sliders, then choice buttons, then selects, FDEFS order inside each. */
export const visibleDefs = (t: TypeInfo | null) =>
  FDEFS.map((d, i) => [d, i] as const)
    .filter(([d]) => fitsType(d, t))
    .sort((a, b) => RANK[a[0].kind] - RANK[b[0].kind] || a[1] - b[1])
    .map(([d]) => d)

/** The sheet filters that are on and visible for the type: the badge count (§6.3). */
export const activeDefs = (fx: Fx, t: TypeInfo | null) => FDEFS.filter((d) => fitsType(d, t) && fx[d.k] !== undefined && fx[d.k] !== '')

/** Does a deal pass one sheet filter? A filter leaves out deals where the detail was not recorded. */
function passes(def: FDef, d: DealJSON, v: FxValue): boolean {
  if (def.kind === 'range') {
    const a = def.range!(d)
    const [lo, hi] = v as Range
    return !!a && a > 0 && a >= lo && a <= hi
  }
  return def.test!(d, v as string)
}

/**
 * `band`: a Size choice carried over by Market rates' "See the deals" (§7.2.3). It keeps applying
 * as a hidden filter once a type is set; Reset, Clear filters or a type change remove it.
 */
export type BarState = { fLoc: string; fType: string; fPeriod: string; fx: Fx; band?: string }
export const DEFAULT_BAR: BarState = { fLoc: '', fType: '', fPeriod: DEFAULT_PERIOD, fx: {} }

/** `filtered()`: the bar and the sheet, before search (the Market rates list). */
export function filtered<T extends DealJSON>(deals: T[], bar: BarState, types: TypeJSON[], today: string): T[] {
  const t = typeInfoOf(bar.fType, types)
  const act = activeDefs(bar.fx, t)
  const cutoff = periodCutoff(today, Number(bar.fPeriod))
  return deals.filter(
    (d) =>
      (!bar.fLoc || locKeyOf(d) === bar.fLoc) &&
      (!bar.fType || typeKeyOf(d) === bar.fType) &&
      d.date >= cutoff &&
      (!bar.band || d.band === bar.band) &&
      act.every((def) => passes(def, d, bar.fx[def.k]!)),
  )
}

/** How many filters are off their defaults: drives "Clear filters" (§6.3). */
export function filtersOn(bar: BarState, types: TypeJSON[]): number {
  const bars = (bar.fLoc ? 1 : 0) + (bar.fType ? 1 : 0) + (bar.fPeriod !== DEFAULT_PERIOD ? 1 : 0)
  return bars + badgeCount(bar, types)
}

/** The Filters button badge: visible sheet filters that are on, plus a carried Size choice. */
export const badgeCount = (bar: BarState, types: TypeJSON[]) => activeDefs(bar.fx, typeInfoOf(bar.fType, types)).length + (bar.band ? 1 : 0)

// ---------- search (§8.7) ----------

export const squash = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const searchText = (d: DealJSON) =>
  [d.details, d.code, d.link, d.note, d.location.name, d.type.name, d.location.kind === 'Zone' ? 'area' : 'subdivision']
    .map((x) => String(x ?? '').toLowerCase())
    .join(' | ')

/** `searched()`: every word must match, plainly or with punctuation removed. */
export function searched<T extends DealJSON>(list: T[], query: string): T[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ w, sq: squash(w) }))
  if (!words.length) return list
  return list.filter((d) => {
    const { t, tq } = haystack(d)
    return words.every(({ w, sq }) => t.includes(w) || (!!sq && tq.includes(sq)))
  })
}

/**
 * A deal's search text, built once per deal object (NFR-002: 20,000 deals per keystroke). Deals
 * from the store are never mutated, an edit replaces the object, so the cache cannot go stale.
 */
const HAY = new WeakMap<DealJSON, { t: string; tq: string }>()

/** Fill the search-text cache ahead of the first search. */
export function warmSearch(deals: DealJSON[]): void {
  for (const d of deals) haystack(d)
}
function haystack(d: DealJSON) {
  let h = HAY.get(d)
  if (!h) {
    const t = searchText(d)
    h = { t, tq: squash(t) }
    HAY.set(d, h)
  }
  return h
}

// ---------- sort (§7.1.4) ----------

export type SortKey = 'date' | 'pp' | 'size' | 'lot' | 'floor'
export type SortDir = 'asc' | 'desc'
export const SORT_OPTS: { v: `${SortKey}:${SortDir}`; label: string; split?: true }[] = [
  { v: 'date:desc', label: 'Newest first' },
  { v: 'date:asc', label: 'Oldest first' },
  { v: 'pp:desc', label: 'Highest per sqm' },
  { v: 'pp:asc', label: 'Lowest per sqm' },
  { v: 'size:desc', label: 'Largest first' },
  { v: 'size:asc', label: 'Smallest first' },
  { v: 'lot:desc', label: 'Largest lot first', split: true },
  { v: 'lot:asc', label: 'Smallest lot first', split: true },
  { v: 'floor:desc', label: 'Largest floor first', split: true },
  { v: 'floor:asc', label: 'Smallest floor first', split: true },
]

/** `sortVal()`: date sold, price per sqm, the price-basis area, or the lot area (lots: area). */
export function sortVal(d: DealJSON, k: SortKey): number {
  if (k === 'date') return Date.parse(d.date)
  if (k === 'pp') return d.pp
  if (k === 'size' || k === 'floor') return d.area
  return d.type.form === 'lot' ? d.area : (d.lotArea ?? 0)
}

/** Ties sort newest first. */
export function sortList<T extends DealJSON>(list: T[], k: SortKey, dir: SortDir): T[] {
  const s = dir === 'asc' ? 1 : -1
  // ISO dates compare as strings; numeric keys are read once per deal, not once per comparison.
  const cmpDate = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return list
    .map((d, i) => ({ d, i, v: k === 'date' ? 0 : sortVal(d, k) }))
    .sort((a, b) => (k === 'date' ? cmpDate(a.d.date, b.d.date) : a.v - b.v) * s || cmpDate(b.d.date, a.d.date) || a.i - b.i)
    .map((x) => x.d)
}

/** The split view: exactly one house-form type picked (§7.1.4). */
export const isSplit = (t: TypeInfo | null, fType: string) => !!fType && t?.form === 'house'

export const LIMIT = 20

// ---------- slider ranges (§7.1.6) ----------

export type RangeInfo = { min: number; max: number; step: number; bins: number[]; n: number }

/** `rangeInfo()`: ends from every deal of the picked type, rounded out to the step; 24-bin histogram. */
export function rangeInfo(def: FDef, deals: DealJSON[], fType: string, t: TypeInfo): RangeInfo {
  const vals = deals.filter((d) => typeKeyOf(d) === fType).map((d) => def.range!(d)).filter((a): a is number => !!a && a > 0)
  let lo: number
  let hi: number
  if (vals.length >= 2) {
    lo = Math.min(...vals)
    hi = Math.max(...vals)
  } else {
    const dflt = def.k === 'larea' ? (t.form === 'lot' ? [100, 5000] : [50, 1000]) : t.form === 'condo' ? [15, 200] : [30, 1000]
    lo = Math.min(dflt[0], ...vals)
    hi = Math.max(dflt[1], ...vals)
  }
  const span = hi - lo
  const step = span <= 150 ? 5 : span <= 600 ? 10 : span <= 3000 ? 50 : 100
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  if (hi === lo) hi = lo + step
  const bins = new Array<number>(24).fill(0)
  for (const a of vals) bins[Math.min(23, Math.floor(((a - lo) / (hi - lo)) * 24))]++
  return { min: lo, max: hi, step, bins, n: vals.length }
}

const fmtN = (n: number) => Math.round(n).toLocaleString('en-US')
export const rangeText = (info: RangeInfo, a: number, b: number) =>
  a <= info.min && b >= info.max ? 'Any' : a <= info.min ? `Up to ${fmtN(b)}` : b >= info.max ? `${fmtN(a)} and up` : `${fmtN(a)} to ${fmtN(b)}`

/** Clamp to the ends and swap if crossed; the full span turns the filter off (undefined). */
export function clampRange(info: RangeInfo, lo: number, hi: number): Range | undefined {
  let a = Math.max(info.min, Math.min(lo, info.max))
  let b = Math.max(info.min, Math.min(hi, info.max))
  if (a > b) [a, b] = [b, a]
  return a <= info.min && b >= info.max ? undefined : [a, b]
}

// ---------- confidence (§8.3) ----------

export type Confidence = { lvl: 'High' | 'Medium' | 'Low'; n: number; spread: number }
export function confidence(vals: number[]): Confidence | null {
  const n = vals.length
  if (n < MIN_DEALS) return null
  const s = vals.slice().sort((a, b) => a - b)
  const med = pctSorted(s, 0.5)
  const spread = (pctSorted(s, 0.75) - pctSorted(s, 0.25)) / med
  const lvl = n >= 10 && spread <= 0.15 ? 'High' : n >= 7 && spread <= 0.25 ? 'Medium' : 'Low'
  return { lvl, n, spread }
}

/** `confReason(c, noun)`: "{only }{n} {noun}, {spread words}". */
export const confReason = (c: Confidence, noun: string) =>
  `${c.n < 10 ? 'only ' : ''}${c.n} ${noun}, ${c.spread > 0.25 ? 'prices spread widely' : c.spread > 0.15 ? 'prices fairly spread' : 'prices close together'}`
