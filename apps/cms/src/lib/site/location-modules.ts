/**
 * BPM-017 — the listing modules on a location page: Resale tabs (sale_detail_type 1) and
 * Pre-selling tabs (sale_detail_type 2), each tab a search-results module with property_for=1,
 * 8 per page. Tab sets are the city page's (municipality level), used on both levels for now
 * (pending: location-defects).
 */
export type LocationTab = { label: string; types: string[]; sort?: string }

export const RESALE_TABS: LocationTab[] = [
  { label: 'All', types: [] },
  { label: 'House', types: ['_st_9'] },
  { label: 'Residential Lot', types: ['_st_8'] },
  { label: 'Condo-Condotel', types: ['_st_10', '_st_38', '_st_94'] },
  { label: 'Commercial', types: ['_st_7'] },
  { label: 'Agri-Industrial', types: ['_st_53', '_st_52'] },
]

export const PRESELLING_TABS: LocationTab[] = [
  { label: 'All', types: [] },
  { label: 'House', types: ['_st_9'], sort: 'date_desc' },
  { label: 'Residential Lot', types: ['_st_8'] },
  { label: 'Condo-Condotel', types: ['_st_10', '_st_38', '_st_94'], sort: 'date_desc' },
  { label: 'Agri-Industrial', types: ['_st_52', '_st_54'] },
]

/** Builds a tab's module query: property_for=1, sale detail, area, types, 8 per page. */
export function tabQuery(saleDetail: '1' | '2', area: string | null, tab: LocationTab): URLSearchParams {
  const sp = new URLSearchParams({ property_for: '1' })
  sp.append('sale_detail_type[]', saleDetail)
  if (area) sp.append('area[]', area)
  for (const t of tab.types) sp.append('type[]', t)
  if (tab.sort) sp.set('sortby', tab.sort)
  return sp
}
