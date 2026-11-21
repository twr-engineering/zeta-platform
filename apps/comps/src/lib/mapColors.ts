/**
 * Closed deals map colors (app PRD §8.16, §9.2.3): stable type colors when no type is
 * filtered, and 5 price shades when one is. Pure; tokens are CSS custom property names.
 */
import type { DealJSON, TypeJSON } from './data'
import { refKey } from './deals'

export type TypeColors = {
  /** Color token of a type key (`id:5` or `name:…`), or '--muted' for grey. */
  color: (typeKey: string) => string
  /** Colored type keys, in Settings order. */
  colored: string[]
}

/** `typeColors()`: counted over all deals; up to 6 keep a color, else the 5 most used (ties by Settings order). */
export function typeColors(allDeals: DealJSON[], types: TypeJSON[]): TypeColors {
  const counts = new Map<string, number>()
  for (const d of allDeals) counts.set(refKey(d.type), (counts.get(refKey(d.type)) ?? 0) + 1)
  const order = [...types.map((t) => refKey(t))]
  for (const d of allDeals) if (!order.includes(refKey(d.type))) order.push(refKey(d.type))
  const used = order.filter((k) => (counts.get(k) ?? 0) > 0)
  const keep = used.length <= 6 ? used : [...used].sort((a, b) => counts.get(b)! - counts.get(a)! || used.indexOf(a) - used.indexOf(b)).slice(0, 5)
  const colored = used.filter((k) => keep.includes(k))
  const map = new Map(colored.map((k, i) => [k, `--c${i + 1}`]))
  return { color: (k) => map.get(k) ?? '--muted', colored }
}

/** One type filtered: r = rank / max(n − 1, 1), step = min(4, ⌊5r⌋), token --s{step+1}. */
export function shadeOf(pp: number, sortedPps: number[]): string {
  const r = sortedPps.indexOf(pp) / Math.max(sortedPps.length - 1, 1)
  return `--s${Math.min(4, Math.floor(r * 5)) + 1}`
}

/** "₱26k / sqm" for the selected deal's tooltip (§9.2.2). */
export const kPerSqm = (pp: number) => `₱${Math.round(pp / 1000)}k / sqm`
