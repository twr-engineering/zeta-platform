import {
  FORECLOSED,
  LOT_TYPES,
  PRICE_ABOVE,
  PROPERTY_TYPES,
  PROPERTY_VIEWS,
  SALES_DETAILS,
  withParam,
} from '@zeta/parity/search/form'
import { getAll } from '@zeta/parity/search/params'

/**
 * FR-SR12 — applied filters as removable chips. Each chip carries the URL without it (pageid reset,
 * as every live control does). property_for, sortby, currency and paging are not filters.
 */
export type Chip = { key: string; label: string; href: string }

const TYPE_LABELS = new Map(PROPERTY_TYPES.flatMap((b) => b.types.flatMap((t) => [[t.value, t.label] as const, ...t.children.map((c) => [c.value, c.label] as const)])))
const FA_LABELS = new Map([...PROPERTY_VIEWS.map((o) => [o.value, `${o.label} view`] as const), ...LOT_TYPES.map((o) => [o.value, `${o.label} lot`] as const), ...FORECLOSED.map((o) => [o.value, `Foreclosed: ${o.label}`] as const)])
const SALES_LABELS = new Map(SALES_DETAILS.map((o) => [o.value, o.label]))
const peso = (n: string) => `₱${Number(n).toLocaleString('en-US')}`

/** `areaLabels`: area[] value to location name (the picker options); an unknown value reads "Location". */
export function filterChips(sp: URLSearchParams, path = '/search_results/', areaLabels: Record<string, string> = {}): Chip[] {
  const chips: Chip[] = []
  const href = (next: URLSearchParams) => `${path}?${next.toString()}`
  const multi = (key: string, label: (v: string) => string | undefined) => {
    const values = getAll(sp, key)
    for (const v of values) chips.push({ key: `${key}:${v}`, label: label(v) ?? v, href: href(withParam(sp, key, values.filter((x) => x !== v))) })
  }
  const single = (key: string, label: (v: string) => string) => {
    const v = sp.get(key)
    if (v) chips.push({ key, label: label(v), href: href(withParam(sp, key, null)) })
  }

  single('q', (v) => `“${v}”`)
  single('keyword_1', (v) => `Ref: ${v}`)
  single('keyword', (v) => `Ref: ${v}`)
  multi('type', (v) => TYPE_LABELS.get(v))
  single('min_bedroom', (v) => `${v.replace('+', '')}+ bedrooms`)
  single('min_bathroom', (v) => `${v.replace('+', '')}+ bathrooms`)

  const lo = sp.get('min_price')
  const hi = sp.get('max_price')
  if (lo || hi) {
    const label = lo === String(PRICE_ABOVE.min) && hi === String(PRICE_ABOVE.max) ? `Above ${peso(lo)}` : `${lo ? peso(lo) : 'Any'} – ${hi ? peso(hi) : 'Any'}`
    chips.push({ key: 'price', label, href: href(withParam(withParam(withParam(sp, 'price', null), 'min_price', null), 'max_price', null)) })
  }

  multi('sale_detail_type', (v) => SALES_LABELS.get(v))
  multi('fa', (v) => FA_LABELS.get(v))
  multi('payment_terms', (v) => v)
  multi('min_storey', (v) => `${v.replace('+', '')}+ storeys`)
  multi('area', (v) => areaLabels[v] ?? 'Location')
  single('min_plot_size', (v) => `Lot ≥ ${v}`)
  single('max_plot_size', (v) => `Lot ≤ ${v}`)
  single('min_total_built_size', (v) => `Floor ≥ ${v}`)
  single('max_total_built_size', (v) => `Floor ≤ ${v}`)
  single('min_built_year', (v) => `Built ≥ ${v}`)
  single('max_built_year', (v) => `Built ≤ ${v}`)
  return chips
}
