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
  /** type[]=_sst_{n} — sub-sub-types (BPM-021); the CRM's sub_sub_property_type[]. */
  subSubTypeIds: string[]
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
  /**
   * FR-SR14 (E-class, not a live parameter): free text in `q`, matched against title, development,
   * location names and reference. Kept apart from keyword_{n}, whose reference-only rule (BPM-016)
   * stays exact.
   */
  text: string | null
  ranges: Partial<Record<RangeFacet, Range>>
  sort: SortValue
  perPage: number
  page: number
  /** Calculator hand-off. Preserved, not applied (pending: amount-filter). */
  amount: string | null
  /** payment_terms[] (BPM-021): passed to the CRM untouched; preserved, not applied (pending: payment-terms-filter). */
  paymentTerms: string[]
  /** min_storey[] (BPM-021, select capped at one; "5+" sanitises to 5). */
  minStorey: number | null
  /** min_built_year / max_built_year (BPM-021, AJAX path: raw years). */
  builtYear: Range | null
}

/** Module configuration: what the WordPress block attributes supplied ($args). */
export type SearchModuleConfig = {
  sortby?: string
  propertyPerPage?: number
  /** BPM-006a: the module's `property_per_page_phone`. Absent = the block default, 9. */
  propertyPerPagePhone?: number
  layout?: string
  /** BPM-006a: Mobile_Detect's class for this request. Phone = isMobile && !isTablet. */
  device?: Device
}

/** BPM-006a — `Detect::deviceType()` (respacio includes/detect.php:66–68). A tablet is not a phone. */
export type Device = 'Phone' | 'Tablet' | 'Computer'

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

/**
 * BPM-006 + BPM-006a (search-results.php:730–738). On a Phone the module's phone size wins; WP
 * fills the registered block default ('9') when the attribute is absent, so a phone gets 9 unless
 * the module sets its own (12→9, 8→9, 30→9 on the live modules). Otherwise the desktop size, else
 * posts_per_page (9). ?property_per_page overrides both unless the layout is card_only.
 */
export const MAX_PER_PAGE = 50
export function resolvePerPage(requested: string | null, config: SearchModuleConfig): number {
  const fromConfig = config.device === 'Phone' ? (config.propertyPerPagePhone ?? 9) : (config.propertyPerPage ?? 9)
  const n = config.layout !== 'card_only' && requested ? Number.parseInt(requested, 10) : fromConfig
  // Production leaves ?property_per_page unbounded. Bounding at the corpus maximum (50) is a
  // deviation that is invisible for every observed value.
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PER_PAGE) : fromConfig
}

/**
 * BPM-016 (search-results.php:464–500, :557–576). The free-text field is `keyword_{n}`: the suffix
 * is stripped only when ?property_for allows that sale type (`_1` unless property_for is 2–5,
 * `_2` only for 2 or none, `_3`, `_4` likewise). The `_5` branch never strips its suffix, so
 * `keyword_5` is never a keyword. A bare `keyword` always counts. The value is sent raw.
 */
export function resolveKeyword(sp: Sp): string | null {
  const pf = sp.get('property_for')
  let found: string | null = null
  for (const [k, v] of sp) {
    const m = /^keyword(?:_([1-4]))?$/.exec(k)
    if (!m || v === '') continue
    if (m[1] && pf && ['1', '2', '3', '4', '5'].includes(pf) && pf !== m[1]) continue
    found = v
  }
  return found
}

export function parseSearch(sp: Sp, config: SearchModuleConfig = {}): SearchQuery {
  const ranges: SearchQuery['ranges'] = {}

  // Path A — direct bounds (BPM-003).
  for (const [facet, unit] of [
    ['price', 'price'],
    ['bedroom', 'bedroom'],
    ['bathroom', 'bathroom'],
    // BPM-021: the More Filters Lot Area / Floor Area boxes send min_/max_ pairs too.
    ['plot_size', 'plot_size'],
    ['total_built_size', 'total_built_size'],
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
    // max = 0 after an open-ended band is no ceiling (live check 2026-11-24: 124 = 124).
    ranges[facet] = { min, max: max === 0 ? null : max }
  }

  const area = getAll(sp, 'area')
  const sort = resolveSort(sp.get('sortby'), config.sortby)
  if (sort.startsWith('date') || sort.startsWith('priorityprice')) pending('sort-field-semantics')
  const amount = sp.get('amount')
  if (amount !== null) pending('amount-filter')
  const keyword = resolveKeyword(sp)
  const paymentTerms = getAll(sp, 'payment_terms')
  if (paymentTerms.length) pending('payment-terms-filter')
  const storey = Number.parseInt(sanitise(getAll(sp, 'min_storey')[0] ?? ''), 10)
  const minYear = Number.parseInt(sp.get('min_built_year') ?? '', 10)
  const maxYear = Number.parseInt(sp.get('max_built_year') ?? '', 10)

  return {
    propertyFor: sp.get('property_for'),
    subTypeIds: getAll(sp, 'type').filter((t) => !t.startsWith('_sst_')).map((t) => t.replace(/^_st_/, '')),
    subSubTypeIds: getAll(sp, 'type').filter((t) => t.startsWith('_sst_')).map((t) => t.slice('_sst_'.length)),
    saleDetailTypeIds: getAll(sp, 'sale_detail_type'),
    attributeIds: getAll(sp, 'fa').map((a) => a.replace(/^a/, '')),
    municipalityIds: area.filter((a) => a.startsWith('municipality_')).map((a) => a.slice('municipality_'.length)),
    townIds: area.filter((a) => a.startsWith('city_')).map((a) => a.slice('city_'.length)),
    complexIds: getAll(sp, 'complex_name'),
    referenceNos: getAll(sp, 'reference_no'),
    keyword: keyword || null,
    text: sp.get('q')?.trim() || null,
    ranges,
    sort,
    perPage: resolvePerPage(sp.get('property_per_page'), config),
    page: Math.max(1, Number.parseInt(sp.get('pageid') ?? '1', 10) || 1),
    amount,
    paymentTerms,
    minStorey: Number.isFinite(storey) && storey > 0 ? storey : null,
    builtYear: Number.isFinite(minYear) || Number.isFinite(maxYear) ? { min: Number.isFinite(minYear) ? minYear : 0, max: Number.isFinite(maxYear) ? maxYear : null } : null,
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
  arr('sub_sub_property_type', q.subSubTypeIds)
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

/**
 * BPM-012 + search-results.php:408, :454–461 — a module's own `query` attribute is read first, then
 * $_GET is layered on top unless the block sets ignore_get=true (shortlists and /search_results/
 * set false): a key present in the request replaces that key from the saved query (array keys as a
 * whole), and every other saved key stays.
 */
export function mergeModuleQuery(saved: string, request: Sp, ignoreGet = false): URLSearchParams {
  const out = new URLSearchParams(saved)
  if (ignoreGet) return out
  const base = (k: string) => k.replace(/\[\d*\]$/, '')
  const requested = new Set([...request.keys()].map(base))
  for (const k of [...out.keys()]) if (requested.has(base(k))) out.delete(k)
  for (const [k, v] of request) out.append(k, v)
  return out
}
