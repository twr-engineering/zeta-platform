import { pending } from '@/lib/parity/pending'
import type { Payload, Where } from 'payload'

import type { RangeFacet, SearchQuery, SortValue } from './params'

/**
 * SearchQuery -> Payload query over the Listings mirror. The front end's only route to
 * inventory; the CRM is never queried on the request path (PRD §15.6).
 */

const RANGE_FIELDS: Record<RangeFacet, string> = {
  price: 'price',
  bedroom: 'bedrooms',
  bathroom: 'bathrooms',
  plot_size: 'plotSize',
  total_built_size: 'builtSize',
}

/** Interim mappings for date / priorityprice — pending: sort-field-semantics. */
const SORTS: Record<SortValue, string[]> = {
  date_asc: ['crmModifiedAt'],
  date_desc: ['-crmModifiedAt'],
  price_asc: ['price'],
  price_desc: ['-price'],
  priority_desc: ['-priority'],
  priorityprice_asc: ['-priority', 'price'],
  priorityprice_desc: ['-priority', '-price'],
}

export function toWhere(q: SearchQuery): Where {
  const and: Where[] = [{ syncStatus: { equals: 'active' } }]
  if (q.propertyFor) and.push({ propertyForId: { equals: q.propertyFor } })
  // One property-type facet: sub-types and sub-sub-types OR-ed — pending: type-tree-combination.
  // The live tree never sends a parent with its own child (BPM-021).
  const types: Where[] = []
  if (q.subTypeIds.length) types.push({ subTypeId: { in: q.subTypeIds } })
  if (q.subSubTypeIds.length) {
    pending('type-tree-combination')
    types.push({ subSubTypeId: { in: q.subSubTypeIds } })
  }
  if (types.length) and.push(types.length === 1 ? types[0] : { or: types })
  if (q.saleDetailTypeIds.length) and.push({ saleDetailTypeId: { in: q.saleDetailTypeIds } })
  // AND across selected attributes: the listing must carry every one.
  for (const id of q.attributeIds) and.push({ 'attributes.crmId': { equals: id } })

  // One area facet, OR-ed internally — pending: area-facet-combination.
  const area: Where[] = []
  if (q.municipalityIds.length) area.push({ 'geo.municipalityId': { in: q.municipalityIds } })
  if (q.townIds.length) area.push({ 'geo.townId': { in: q.townIds } })
  if (area.length) and.push(area.length === 1 ? area[0] : { or: area })

  if (q.complexIds.length) and.push({ 'geo.complexId': { in: q.complexIds } })
  if (q.referenceNos.length) and.push({ referenceNo: { in: q.referenceNos } })

  if (q.attributeIds.length > 1) pending('fa-collision')
  if (q.minStorey !== null) and.push({ storeys: { greater_than_equal: q.minStorey } })
  if (q.builtYear) {
    if (q.builtYear.min > 0) and.push({ builtYear: { greater_than_equal: q.builtYear.min } })
    if (q.builtYear.max !== null) and.push({ builtYear: { less_than_equal: q.builtYear.max } })
  }

  for (const [facet, r] of Object.entries(q.ranges) as [RangeFacet, NonNullable<SearchQuery['ranges'][RangeFacet]>][]) {
    const field = RANGE_FIELDS[facet]
    if (r.min > 0) and.push({ [field]: { greater_than_equal: r.min } })
    if (r.max !== null) and.push({ [field]: { less_than_equal: r.max } })
  }
  return { and }
}

/**
 * BPM-016 — a keyword is turned into references BEFORE the search (search-results.php:557–576):
 * `filter_property` with fields=reference_no, the request's property_for (default '1', Sale) and
 * property_per_page=50. The matches are appended to reference_no[] and AND-ed with every other
 * facet; none → the fake reference, i.e. zero results. Titles are never matched.
 * The CRM's match is partial (ZTP73 → ZTP730–739); prefix vs contains is indistinguishable on the
 * corpus (every ref starts ZTP), so contains is used. Which 50 the CRM returns is CRM-side.
 */
export const KEYWORD_LOOKUP_CAP = 50
export const NO_MATCH_REF = 'no results fake reference'

export async function keywordRefs(payload: Payload, keyword: string, propertyFor: string | null): Promise<string[]> {
  pending('keyword-case')
  const { docs } = await payload.find({
    collection: 'listings',
    where: { and: [{ syncStatus: { equals: 'active' } }, { propertyForId: { equals: propertyFor || '1' } }, { referenceNo: { contains: keyword } }] },
    sort: 'referenceNo',
    limit: KEYWORD_LOOKUP_CAP,
    depth: 0,
    select: { referenceNo: true },
  })
  return docs.map((d) => d.referenceNo).filter((r): r is string => !!r)
}

export async function searchListings(payload: Payload, q: SearchQuery) {
  if (q.keyword !== null) {
    const refs = await keywordRefs(payload, q.keyword, q.propertyFor)
    q = { ...q, referenceNos: [...q.referenceNos, ...(refs.length ? refs : [NO_MATCH_REF])] }
  }
  return payload.find({
    collection: 'listings',
    where: toWhere(q),
    sort: SORTS[q.sort],
    limit: q.perPage,
    page: q.page,
    depth: 0,
  })
}
