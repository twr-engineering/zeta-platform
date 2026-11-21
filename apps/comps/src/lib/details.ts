/**
 * The deal details panel (app PRD §7.1.5, Appendix A.3): which fields show, in one fixed
 * order for every type, with their display values, and the grid column rule.
 */
import type { DealJSON } from './data'
import { FIN_OPTS, FURN_OPTS } from './deals'
import { fmtDate, peso, pesoShort } from './format'
import { listingHref, zetaCode } from './listing'

export type AskingGap = { kind: 'at' } | { kind: 'below' | 'above'; pct: string }

/** gap% = (asking − price) / asking × 100: under 0.05 in size is "At asking". */
export function askingGap(asking: number, price: number): AskingGap {
  const gp = ((asking - price) / asking) * 100
  if (Math.abs(gp) < 0.05) return { kind: 'at' }
  return { kind: gp > 0 ? 'below' : 'above', pct: Math.abs(gp).toFixed(1) }
}

const label = (opts: readonly (readonly [string, string])[], v: string | null) => (v ? (opts.find((o) => o[0] === v)?.[1] ?? v) : null)

/** `parkLabel()`: None / 1 / 2 / 3 or more, then whether it is in the price. */
export function parkLabel(n: number | null, incl: string | null): string | null {
  if (n === null || n === undefined) return null
  let t = n === 0 ? 'None' : n >= 3 ? '3 or more' : String(n)
  if (n > 0 && incl) t += incl === 'Included' ? ', included in the price' : ', sold separately'
  return t
}

/** `bedsLabel()`: the short form used in tables (Studio, 2BR, 5+ BR). */
export const bedsLabel = (n: number | null) => (n === null || n === undefined ? '' : n === 0 ? 'Studio' : n >= 5 ? '5+ BR' : `${n}BR`)

export type Field =
  | { label: string; kind: 'text'; value: string }
  | { label: 'Last asking price'; kind: 'asking'; value: string; gap: AskingGap }
  | { label: 'Link'; kind: 'link'; href: string }

/** The fields that have a value, in the order of §7.1.5. */
export function detailFields(d: DealJSON): Field[] {
  const t = (lbl: string, v: string | null | undefined): Field[] => (v ? [{ label: lbl, kind: 'text', value: v }] : [])
  const feats = [d.corner ? 'Corner lot' : '', d.view === 'Ridge view' ? 'Ridge view' : '', d.terrain ? (d.terrain === 'Irregular' ? 'Irregular shape' : d.terrain) : '']
    .filter(Boolean)
    .join(', ')
  const href = listingHref(d)
  return [
    ...t('Sold price', peso(d.price)),
    ...t('Date sold', fmtDate(d.date)),
    ...(d.asking ? [{ label: 'Last asking price' as const, kind: 'asking' as const, value: pesoShort(d.asking), gap: askingGap(d.asking, d.price) }] : []),
    ...t('Days on market', d.dom !== null ? String(d.dom) : null),
    ...t('Bathrooms', d.baths !== null ? (d.baths >= 5 ? '5 or more' : String(d.baths)) : null),
    ...t('Bedrooms', d.beds !== null ? (d.beds === 0 ? 'Studio' : d.beds >= 5 ? '5 or more' : String(d.beds)) : null),
    ...t('Parking', parkLabel(d.parking, d.parkIncl)),
    ...t('Storeys', d.storeys ? (d.storeys >= 4 ? '4 or more' : String(d.storeys)) : null),
    ...t('Floor level', d.floor ? String(d.floor) : null),
    ...t('Frontage', d.frontage ? `${d.frontage} m` : null),
    ...t('Lot features', feats),
    ...t('Location type', d.location.kind === 'Zone' ? 'Area (outside a subdivision)' : null),
    ...t('Mode of payment', label(FIN_OPTS, d.fin)),
    ...t('Condition', d.cond),
    ...t('Furnishing', label(FURN_OPTS, d.furn)),
    ...t('Year built', d.year ? String(d.year) : null),
    ...t('Listing code', d.code && d.link && zetaCode(d.link) !== d.code.toUpperCase() ? d.code : null),
    ...(href ? [{ label: 'Link' as const, kind: 'link' as const, href }] : []),
  ]
}

/** n ≤ 4: n columns; else 3 or 4, whichever leaves fewer empty cells in the last row (4 on a tie). */
export const gridCols = (n: number) => (n <= 4 ? n : (3 - (n % 3)) % 3 < (4 - (n % 4)) % 4 ? 3 : 4)
