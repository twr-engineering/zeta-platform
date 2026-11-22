/**
 * The CMA (app PRD §7.3, §8.11–8.14): comps and the "similar" rules, the estimate, the notes,
 * the description and `locCenter()`. Pure; names follow the reference build.
 */
import type { DealJSON } from './data'
import { bedsLabel } from './details'
import { refKey, type TypeInfo } from './deals'
import { confidence, periodCutoff, type Confidence } from './filters'
import { distanceLabel } from './format'
import { median, metres, MIN_DEALS, pct } from './stats'
import { bandOf } from './settings'

export type Subject = {
  typeKey: string
  typeName: string
  type: TypeInfo
  /** 0 = no area. */
  area: number
  lotArea: number
  frontage: number
  corner: boolean
  ridge: boolean
  terrain: '' | 'Flat' | 'Sloped' | 'Irregular'
  beds: number | null
  baths: number | null
  parking: number | null
  parkIncl: '' | 'Included' | 'Separate'
  cond: '' | 'Brand new' | 'Good' | 'Needs repair'
  year: number | null
  floor: number | null
  furn: '' | 'Furnished' | 'Semi-furnished' | 'Unfurnished'
  asking: number
  lat: number
  lng: number
}

export type CmaSettings = { radius: number; months: number; similar: boolean }
export const DEFAULT_CMA_SETTINGS: CmaSettings = { radius: 1000, months: 24, similar: true }

const n = (x: number) => x.toLocaleString('en-US')

/** The "similar" criteria (§8.11): each only when the subject has the value. Numbers with commas (C17). */
export function criteria(s: Subject): string[] {
  const lot = s.type.form === 'lot'
  const out: string[] = []
  if (lot && s.frontage > 0) out.push(`similar lot size, frontage within 30% of ${n(s.frontage)} m`)
  if (!lot && s.area > 0) out.push(`floor area within 30% of ${n(s.area)} sqm`)
  if (s.lotArea > 0) out.push(`lot area within 30% of ${n(s.lotArea)} sqm`)
  if (s.beds !== null) out.push(`same bedrooms (${bedsLabel(s.beds)})`)
  return out
}

/** Does a comp pass the subject's similar criteria? */
export function isSimilar(s: Subject, d: DealJSON): boolean {
  const lot = s.type.form === 'lot'
  if (lot && s.frontage > 0 && (d.band !== bandOf(s.area || 0) || !d.frontage || Math.abs(d.frontage - s.frontage) / s.frontage > 0.3)) return false
  if (!lot && s.area > 0 && Math.abs(d.area - s.area) / s.area > 0.3) return false
  if (s.lotArea > 0 && (!d.lotArea || Math.abs(d.lotArea - s.lotArea) / s.lotArea > 0.3)) return false
  if (s.beds !== null && d.beds !== s.beds) return false
  return true
}

export type Near = { d: DealJSON; dist: number }
export type CmaResult =
  | { kind: 'noarea' }
  | { kind: 'few'; n: number }
  | { kind: 'ok'; low: number; high: number; mid: number; med: number; conf: Confidence; asking: { pct: string; dir: 'above' | 'below' } | null; notes: string[] }

export type Cma = {
  crit: string[]
  /** The similar filter applies: switched on and at least one criterion. */
  like: boolean
  /** Comps inside the distance, nearest first (R7). */
  inside: Near[]
  /** Same type, passing the filter, outside the distance but within 2 × it (§9.4). */
  tooFar: Near[]
  result: CmaResult
}

export const LOW_NOTE = 'Low confidence. Treat this as a starting point and check the comps below before quoting a number.'

export function runCma(s: Subject, deals: DealJSON[], st: CmaSettings, today: string): Cma {
  const crit = criteria(s)
  const like = st.similar && crit.length > 0
  const cutoff = periodCutoff(today, st.months)
  const near = deals
    .filter((d) => refKey(d.type) === s.typeKey && d.date >= cutoff && (!like || isSimilar(s, d)))
    .map((d) => ({ d, dist: metres(s, d) }))
  const inside = near.filter((x) => x.dist <= st.radius).sort((a, b) => a.dist - b.dist)
  const tooFar = near.filter((x) => x.dist > st.radius && x.dist <= 2 * st.radius).sort((a, b) => a.dist - b.dist)
  let result: CmaResult
  if (!(s.area > 0)) result = { kind: 'noarea' }
  else if (inside.length < MIN_DEALS) result = { kind: 'few', n: inside.length }
  else {
    const v = inside.map((x) => x.d.pp)
    const med = median(v)
    const conf = confidence(v)!
    const comps = inside.map((x) => x.d)
    const notes = s.type.form === 'lot' ? featureNotes(s, comps) : buildingNotes(s, comps)
    if (conf.lvl === 'Low') notes.push(LOW_NOTE)
    let asking: { pct: string; dir: 'above' | 'below' } | null = null
    if (s.asking > 0) {
      const diff = ((s.asking / s.area - med) / med) * 100
      asking = { pct: Math.abs(diff).toFixed(0), dir: diff >= 0 ? 'above' : 'below' }
    }
    result = { kind: 'ok', low: pct(v, 0.25) * s.area, high: pct(v, 0.75) * s.area, mid: med * s.area, med, conf, asking, notes }
  }
  return { crit, like, inside, tooFar, result }
}

const TERRAIN_WORD = { Flat: 'flat', Sloped: 'sloped', Irregular: 'irregular shape' } as const

/** The description used in the result eyebrow (§7.3.3). */
export function description(s: Subject): string {
  const lot = s.type.form === 'lot'
  return (
    `${s.typeName}, ${n(s.area)} sqm` +
    (lot ? '' : ' floor') +
    (s.lotArea > 0 ? ` on a ${n(s.lotArea)} sqm lot` : '') +
    (s.beds !== null ? `, ${bedsLabel(s.beds)}` : '') +
    (lot && s.frontage > 0 ? `, ${n(s.frontage)} m frontage` : '') +
    (lot && s.corner ? ', corner lot' : '') +
    (lot && s.ridge ? ', ridge view' : '') +
    (lot && s.terrain ? `, ${TERRAIN_WORD[s.terrain]}` : '')
  )
}

/** `featureNotes()` for lot types (§8.13). */
export function featureNotes(s: Subject, comps: DealJSON[]): string[] {
  const total = comps.length
  const out: string[] = []
  const cnt = (f: (d: DealJSON) => boolean) => comps.filter(f).length
  const of = (k: number) => `${k === 0 ? 'None' : k} of the ${total} comps `
  const c = cnt((d) => d.corner)
  const r = cnt((d) => d.view === 'Ridge view')
  if (s.corner) out.push(of(c) + (c === 1 ? 'is a corner lot' : 'are corner lots') + '. Corner lots usually sell higher, so this estimate may be low for this one.')
  else if (c / total > 0.4) out.push(of(c) + 'are corner lots, which may push this estimate up.')
  if (s.ridge) out.push(of(r) + (r === 1 ? 'is' : 'are') + ' recorded with a ridge view. Ridge view lots usually sell higher, so this estimate may be low for this one.')
  else if (r / total > 0.4) out.push(of(r) + 'have a ridge view, which may push this estimate up.')
  if (s.terrain === 'Sloped' || s.terrain === 'Irregular') {
    const same = cnt((d) => d.terrain === s.terrain)
    if (same < total / 2) {
      const word = s.terrain === 'Sloped' ? 'sloped' : 'irregular in shape'
      out.push(`${same === 0 ? 'None' : 'Only ' + same} of the ${total} comps ${same === 1 ? 'is' : 'are'} recorded as ${word}. ${s.terrain} lots usually sell lower, so this estimate may be high for this one.`)
    }
  } else if (s.terrain === 'Flat') {
    const rough = cnt((d) => d.terrain === 'Sloped' || d.terrain === 'Irregular')
    if (rough / total > 0.4) out.push(of(rough) + 'are sloped or irregular, which may pull this estimate down.')
  }
  return out
}

const COND_RANK = { 'Needs repair': 1, Good: 2, 'Brand new': 3 } as const
const FURN_RANK = { Unfurnished: 1, 'Semi-furnished': 2, Furnished: 3 } as const
const LOW = ' so this estimate may be low for this one.'
const HIGH = ' so this estimate may be high for this one.'

/** `buildingNotes()` for houses, buildings and condos (§8.13). */
export function buildingNotes(s: Subject, comps: DealJSON[]): string[] {
  const out: string[] = []
  const cmp = (mine: number | null, get: (d: DealJSON) => number | null, gap: number, more: string, less: string) => {
    if (mine === null) return
    const vals = comps.map(get).filter((v): v is number => v !== null)
    if (!vals.length) return
    const mid = median(vals)
    const known = vals.length === comps.length ? `the ${comps.length} comps` : `the ${vals.length} comps that have this recorded (out of ${comps.length})`
    if (mine - mid >= gap) out.push(`${more} ${known},${LOW}`)
    else if (mid - mine >= gap) out.push(`${less} ${known},${HIGH}`)
  }
  cmp(s.cond ? COND_RANK[s.cond] : null, (d) => (d.cond ? COND_RANK[d.cond] : null), 1, 'It is in better condition than most of', 'It is in worse condition than most of')
  cmp(s.year, (d) => d.year || null, 8, 'It is newer than most of', 'It is older than most of')
  cmp(s.furn ? FURN_RANK[s.furn] : null, (d) => (d.furn ? FURN_RANK[d.furn] : null), 1, 'It is more furnished than most of', 'It is less furnished than most of')
  cmp(s.baths, (d) => d.baths, 1, 'It has more bathrooms than most of', 'It has fewer bathrooms than most of')
  cmp(s.floor, (d) => d.floor || null, 8, 'It is on a higher floor than most of', 'It is on a lower floor than most of')
  if (s.type.form === 'condo') {
    // A slot sold with the unit lifts the price per sqm, so compare like with like.
    const inc = (p: number | null, i: string | null) => (p !== null && p > 0 && i === 'Included' ? 1 : p === 0 || i === 'Separate' ? 0 : null)
    cmp(inc(s.parking, s.parkIncl || null), (d) => inc(d.parking, d.parkIncl), 0.5, 'Its price includes parking, unlike most of', 'Its price does not include parking, unlike most of')
  } else cmp(s.parking, (d) => d.parking, 1, 'It has more parking than most of', 'It has less parking than most of')
  return out
}

/** `locCenter()` (§8.12): mean of the place's deal pins; else its Settings center; else the current pin. */
export function locCenter(locKey: string, deals: DealJSON[], places: { id: number; lat: number; lng: number }[], current: { lat: number; lng: number }) {
  const here = deals.filter((d) => refKey(d.location) === locKey)
  if (here.length) return { lat: here.reduce((a, d) => a + d.lat, 0) / here.length, lng: here.reduce((a, d) => a + d.lng, 0) / here.length }
  const p = places.find((x) => `id:${x.id}` === locKey)
  return p ? { lat: p.lat, lng: p.lng } : current
}

/** "1 km, last 24 months, similar only" (§7.3.2). */
export const searchSummary = (st: CmaSettings, like: boolean) => `${distanceLabel(st.radius)}, last ${st.months} months${like ? ', similar only' : ''}`
