/**
 * BPM-021 — the live /search_results/ filter bar (customtemplates 305520, wrapper 263744): its
 * options and the exact query parameters each control writes. CAPTURED: labels, ids and param
 * names are frozen; only the presentation is ours.
 */
export type Opt = { label: string; value: string }

/** Sale / Rent pill: property_for (CRM sale_detail rows filtered to 1,2). */
export const PROPERTY_FOR: Opt[] = [
  { label: 'Sale', value: '1' },
  { label: 'Rent', value: '2' },
]

/** Property Type: two branches, Residential pinned first; sub-types _st_{id}, sub-sub-types _sst_{id}, A–Z. */
export type TypeNode = { label: string; value: string; children: Opt[] }
export const PROPERTY_TYPES: { branch: string; types: TypeNode[] }[] = [
  {
    branch: 'Residential',
    types: [
      { label: 'Apartment', value: '_st_10', children: [{ label: 'Duplex', value: '_sst_35' }, { label: 'Multi Unit', value: '_sst_90' }] },
      { label: 'Condominium', value: '_st_38', children: [{ label: 'Junior One Bedroom', value: '_sst_85' }, { label: 'Penthouse', value: '_sst_45' }, { label: 'Studio', value: '_sst_39' }] },
      { label: 'Condotel', value: '_st_94', children: [] },
      {
        label: 'House',
        value: '_st_9',
        children: [
          { label: 'Bungalow', value: '_sst_37' },
          { label: 'Farm House', value: '_sst_46' },
          { label: 'Single Attached', value: '_sst_43' },
          { label: 'Single Detached', value: '_sst_44' },
          { label: 'Town House', value: '_sst_32' },
          { label: 'Villa', value: '_sst_30' },
        ],
      },
      { label: 'Residential Land', value: '_st_8', children: [] },
    ],
  },
  {
    branch: 'Commercial',
    types: [
      { label: 'Agricultural', value: '_st_53', children: [{ label: 'Farm Lot', value: '_sst_96' }, { label: 'Poultry Farm', value: '_sst_61' }] },
      {
        label: 'Commercial',
        value: '_st_7',
        children: [
          { label: 'Commercial Lot', value: '_sst_97' },
          { label: 'Coworking Space', value: '_sst_82' },
          { label: 'Mix-used Building', value: '_sst_69' },
          { label: 'Office Space', value: '_sst_77' },
        ],
      },
      { label: 'Hospitality & Leisure', value: '_st_5', children: [{ label: 'Botique Hotel', value: '_sst_65' }, { label: 'Resort', value: '_sst_66' }] },
      { label: 'Industrial', value: '_st_52', children: [{ label: 'Land', value: '_sst_98' }, { label: 'Warehouse', value: '_sst_63' }] },
    ],
  },
]

/**
 * Style-2 tree rules (search-form.php:1484–1525): ticking a parent clears its children; ticking a
 * child clears its parent; so a parent and its own child are never sent together.
 */
export function toggleType(selected: string[], value: string): string[] {
  const on = !selected.includes(value)
  let next = on ? [...selected, value] : selected.filter((v) => v !== value)
  for (const { types } of PROPERTY_TYPES) {
    for (const t of types) {
      const kids = t.children.map((c) => c.value)
      if (value === t.value && on) next = next.filter((v) => !kids.includes(v))
      if (kids.includes(value) && on) next = next.filter((v) => v !== t.value)
    }
  }
  return next
}

/** Bedrooms / Bathrooms: min only (min_bedroom / min_bathroom); "6+" sanitises to 6 server-side. */
export const ROOM_OPTIONS: Opt[] = ['1', '2', '3', '4', '5', '6', '6+'].map((v) => ({ label: v, value: v }))

/** Price slider: price= plus min_price/max_price; 1,000–100,000,000, step 50,000. */
export const PRICE_MIN = 1000
export const PRICE_MAX = 100000000
export const PRICE_STEP = 50000
/** "Show Properties Above ₱100,000,000+": min 100,000,000, max 10 × the slider max (search-form.php:5285). */
export const PRICE_ABOVE = { min: PRICE_MAX, max: PRICE_MAX * 10 }

export const SALES_DETAILS: Opt[] = [
  { label: 'Resale', value: '1' },
  { label: 'New Development', value: '2' },
]
/** fa[]=a{id}. a136 is in the template but not in the CRM list, so it never renders. */
export const PROPERTY_VIEWS: Opt[] = [
  ['Mountain', 'a129'], ['River', 'a130'], ['Golf Course', 'a131'], ['Sea', 'a132'], ['Garden', 'a133'], ['Amenity', 'a134'], ['City', 'a135'], ['Sunset', 'a137'],
].map(([label, value]) => ({ label, value }))
export const LOT_TYPES: Opt[] = [
  ['Inner', 'a119'], ['Corner', 'a120'], ['Fairway', 'a121'], ['Ridge', 'a122'], ['End', 'a123'], ['Through', 'a144'],
].map(([label, value]) => ({ label, value }))
/** Is Foreclosed? — a single choice. */
export const FORECLOSED: Opt[] = [
  { label: 'Yes', value: 'a143' },
  { label: 'No', value: 'a142' },
]
/** payment_terms[] — sent untouched (pending: payment-terms-filter). */
export const PAYMENT_TERMS: Opt[] = ['Cash', 'Deferred Cash', 'Bank Financing', 'Pagibig Financing'].map((v) => ({ label: v, value: v }))
/** min_storey[] — a single choice; "5+" is sent raw. */
export const STOREYS: Opt[] = ['1', '2', '3', '4', '5+'].map((v) => ({ label: v, value: v }))

/** Order By (wrapper 263744): only these three are offered. */
export const SORT_OPTIONS: Opt[] = [
  { label: 'Newest', value: 'date_desc' },
  { label: 'Lowest price first', value: 'price_asc' },
  { label: 'Highest price first', value: 'price_desc' },
]

/** Every control writes pageid=1 (search-results.php handlers). */
export function withParam(sp: URLSearchParams, key: string, values: string | string[] | null): URLSearchParams {
  const next = new URLSearchParams(sp)
  for (const k of [...next.keys()]) if (k === key || k === `${key}[]` || new RegExp(`^${key}\\[\\d+\\]$`).test(k)) next.delete(k)
  const list = values === null ? [] : Array.isArray(values) ? values : [values]
  const multi = Array.isArray(values)
  for (const v of list) if (v !== '') next.append(multi ? `${key}[]` : key, v)
  next.set('pageid', '1')
  return next
}
