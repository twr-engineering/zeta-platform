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
  if (q.subTypeIds.length) and.push({ subTypeId: { in: q.subTypeIds } })
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
  if (q.keyword) {
    and.push({ or: [{ referenceNo: { equals: q.keyword } }, { propertyTitle: { like: q.keyword } }] })
  }

  for (const [facet, r] of Object.entries(q.ranges) as [RangeFacet, NonNullable<SearchQuery['ranges'][RangeFacet]>][]) {
    const field = RANGE_FIELDS[facet]
    if (r.min > 0) and.push({ [field]: { greater_than_equal: r.min } })
    if (r.max !== null) and.push({ [field]: { less_than_equal: r.max } })
  }
  return { and }
}

export async function searchListings(payload: Payload, q: SearchQuery) {
  return payload.find({
    collection: 'listings',
    where: toWhere(q),
    sort: SORTS[q.sort],
    limit: q.perPage,
    page: q.page,
    depth: 0,
  })
}
