import { pending } from '../pending'

/**
 * Search URL contract — FR-SR01..SR05. The query string of /search_results/ is FROZEN:
 * shortlists, the calculator redirect and every bookmarked search depend on it.
 *
 * CAPTURED from plugins/respacio/templates/search-results.php and corroborated against the
 * 1,381 cached `properties` calls (tests/fixtures/respacio/search-calls.json):
 *   BPM-002 sort precedence · BPM-003 direct bounds · BPM-004 facet combination
 *   BPM-005 band hull · BPM-006 page size · BPM-012 type/fa/sale_detail_type semantics
 *
 * Parsing is pure and returns a normalised query plus the CRM params the WordPress plugin
 * would have sent, so the parity suite can check both against the corpus.
 */

export type Sp = URLSearchParams

export type Range = { min: number; max: number | null }

export type RangeFacet = 'price' | 'bedroom' | 'bathroom' | 'plot_size' | 'total_built_size'

export const SORT_VALUES = [
  'date_asc',
  'date_desc',
  'price_asc',
  'price_desc',
  'priority_desc',
  'priorityprice_asc',
  'priorityprice_desc',
] as const
export type SortValue = (typeof SORT_VALUES)[number]

export type SearchQuery = {
  propertyFor: string | null
  /** type[]=_st_{n} — OR within. */
  subTypeIds: string[]
  /** sale_detail_type[] — OR within. */
  saleDetailTypeIds: string[]
  /** fa[]=a{n} — AND: use_and_operator_for_attr_fet=1 on 1,355 of 1,381 calls. */
  attributeIds: string[]
  /** area[]=municipality_{id} | city_{id}. city ids are CRM town_id. */
  municipalityIds: string[]
  townIds: string[]
  complexIds: string[]
  referenceNos: string[]
  keyword: string | null
  ranges: Partial<Record<RangeFacet, Range>>
  sort: SortValue
  perPage: number
  page: number
  /** Calculator hand-off. Preserved, not applied (pending: amount-filter). */
  amount: string | null
}

/** Module configuration: what the WordPress block attributes supplied ($args). */
export type SearchModuleConfig = {
  sortby?: string
  propertyPerPage?: number
  layout?: string
}

/** PHP-style array param: accepts `k`, `k[]` and `k[0]`, `k[1]`… in document order. */
export function getAll(sp: Sp, key: string): string[] {
  const out: string[] = []
  for (const [k, v] of sp) {
    if (k === key || k === `${key}[]` || new RegExp(`^${key}\\[\\d+\\]$`).test(k)) out.push(v)
  }
  // array_filter: PHP drops empty strings.
  return out.filter((v) => v !== '')
}

const sanitise = (v: string) => v.replace(/[^A-Za-z0-9. -]/g, '')
const isOpen = (s: string) => s.endsWith('>') || s.endsWith('+')

/**
 * BPM-005 — multi-band facets collapse to their HULL, not a union.
 * A faithful port of search-results.php:603–643, including the quirks: a "+" band resets the
 * ceiling to 0, and min is always emitted (0 when unset). Returned as the raw pair the
 * plugin transmits.
 */
export function bandHull(bands: string[]): { min: number; max: number } {
  let minh = -1
  let maxh = 0
  for (const sv of bands) {
    const comma = sv.split(',')
    const [lo = '', hi = ''] = comma[1] !== undefined && comma[1] !== '' ? comma : sv.split('-')
    if (isOpen(lo)) {
      const base = lo.slice(0, -1)
      if ((Number(base) < minh || minh === -1) && base !== '') minh = Number(base)
      if (Number(base) > maxh) maxh = 0
    } else if (hi.endsWith('+')) {
      if (Number(hi.slice(0, -1)) > maxh) maxh = 0
    } else {
      if ((Number(lo) < minh || minh === -1) && lo !== '') minh = Number(lo)
      if (Number(hi) > maxh && hi !== '') maxh = Number(hi)
    }
  }
  if (minh === -1) minh = 0
  // `if ($maxh != "")` is always true under PHP 8 for an int, so max is always sent.
  return { min: minh, max: maxh }
}

/** BPM-002: ?sortby -> module config -> price_desc. Unknown values never reach the query. */
export function resolveSort(requested: string | null, config?: string): SortValue {
  const legal = (v: string | null | undefined): v is SortValue => !!v && (SORT_VALUES as readonly string[]).includes(v)
  // CD-11: production passes ANY ?sortby string to the CRM unsanitised. Rejecting unknown
  // values is a deliberate F-class fix (security); legal values behave identically.
  if (legal(requested)) return requested
  if (legal(config)) return config
  return 'price_desc'
}

/** BPM-006, desktop branch. ?property_per_page overrides unless the layout is card_only. */
export const MAX_PER_PAGE = 50
export function resolvePerPage(requested: string | null, config: SearchModuleConfig): number {
  pending('phone-page-size')
  const fromConfig = config.propertyPerPage ?? 9
  const n = config.layout !== 'card_only' && requested ? Number.parseInt(requested, 10) : fromConfig
  // Production leaves ?property_per_page unbounded. Bounding at the corpus maximum (50) is a
  // deviation that is invisible for every observed value.
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PER_PAGE) : fromConfig
}

export function parseSearch(sp: Sp, config: SearchModuleConfig = {}): SearchQuery {
  const ranges: SearchQuery['ranges'] = {}

  // Path A — direct bounds (BPM-003).
  for (const [facet, unit] of [
    ['price', 'price'],
    ['bedroom', 'bedroom'],
    ['bathroom', 'bathroom'],
  ] as const) {
    const min = sp.get(`min_${unit}`)
    const max = sp.get(`max_${unit}`)
    if (min === null && max === null) continue
    let maxValue: number | null = null
    if (max !== null) {
      if (max.includes('+')) pending('price-slider-plus') // dropped: no ceiling
      else maxValue = Number(sanitise(max)) || null
    }
    ranges[facet] = { min: Number(sanitise(min ?? '')) || 0, max: maxValue }
  }

  // Path B — banded facets (BPM-005). Overrides path A for the same facet, as the PHP loop does
  // when the banded key is processed later in $_GET order.
  for (const facet of ['price', 'bedroom', 'bathroom', 'plot_size', 'total_built_size'] as const) {
    const bands = getAll(sp, facet)
    if (!bands.length) continue
    const { min, max } = bandHull(bands)
    if (max === 0) pending('band-max-zero')
    ranges[facet] = { min, max: max === 0 ? null : max }
  }

  const area = getAll(sp, 'area')
  const sort = resolveSort(sp.get('sortby'), config.sortby)
  if (sort.startsWith('date') || sort.startsWith('priorityprice')) pending('sort-field-semantics')
  const amount = sp.get('amount')
  if (amount !== null) pending('amount-filter')
  const keyword = sp.get('keyword')
  if (keyword) pending('keyword-search')

  return {
    propertyFor: sp.get('property_for'),
    subTypeIds: getAll(sp, 'type').map((t) => t.replace(/^_st_/, '')),
    saleDetailTypeIds: getAll(sp, 'sale_detail_type'),
    attributeIds: getAll(sp, 'fa').map((a) => a.replace(/^a/, '')),
    municipalityIds: area.filter((a) => a.startsWith('municipality_')).map((a) => a.slice('municipality_'.length)),
    townIds: area.filter((a) => a.startsWith('city_')).map((a) => a.slice('city_'.length)),
    complexIds: getAll(sp, 'complex_name'),
    referenceNos: getAll(sp, 'reference_no'),
    keyword: keyword || null,
    ranges,
    sort,
    perPage: resolvePerPage(sp.get('property_per_page'), config),
    page: Math.max(1, Number.parseInt(sp.get('pageid') ?? '1', 10) || 1),
    amount,
  }
}

/**
 * The params the WordPress plugin sends to the CRM for a parsed query. Exists for the parity
 * suite: it must reproduce the cached corpus for the facets it covers.
 */
export function toCrmParams(q: SearchQuery): Record<string, string> {
  const out: Record<string, string> = {}
  const arr = (key: string, values: string[]) => values.forEach((v, i) => (out[`${key}[${i}]`] = v))
  if (q.propertyFor) out.property_for = q.propertyFor
  arr('type', q.subTypeIds.map((id) => `_st_${id}`))
  arr('sub_property_type', q.subTypeIds)
  arr('sale_detail_type', q.saleDetailTypeIds)
  arr('municipality', q.municipalityIds)
  arr('city', q.townIds)
  const [orderBy, order] = q.sort.split('_')
  out.order_by = orderBy
  out.order = order
  out.property_per_page = String(q.perPage)
  out.page_id = String(q.page)
  for (const [facet, r] of Object.entries(q.ranges)) {
    out[`min_${facet}`] = String(r.min)
    if (r.max !== null) out[`max_${facet}`] = String(r.max)
  }
  return out
}
