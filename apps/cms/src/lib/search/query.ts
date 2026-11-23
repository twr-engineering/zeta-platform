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

  // FR-SR14: free text, every word must appear in one of these fields (Payload `like`).
  if (q.text) {
    and.push({
      or: ['propertyTitle', 'referenceNo', 'geo.complexName', 'geo.cityName', 'geo.municipalityName', 'geo.provinceName'].map((f) => ({ [f]: { like: q.text } })),
    })
  }

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

/** Folds the keyword lookup (BPM-016) into referenceNos, so every query below sees the same set. */
export async function resolveQuery(payload: Payload, q: SearchQuery): Promise<SearchQuery> {
  if (q.keyword === null) return q
  const refs = await keywordRefs(payload, q.keyword, q.propertyFor)
  return { ...q, referenceNos: [...q.referenceNos, ...(refs.length ? refs : [NO_MATCH_REF])] }
}

/** `extra` narrows further (e.g. a location page matching by name until it is bound to CRM ids). */
export async function searchListings(payload: Payload, q: SearchQuery, extra?: Where) {
  const resolved = await resolveQuery(payload, q)
  const where = toWhere(resolved)
  return payload.find({
    collection: 'listings',
    where: extra ? { and: [where, extra] } : where,
    sort: SORTS[resolved.sort],
    limit: resolved.perPage,
    page: resolved.page,
    depth: 0,
  })
}

export async function countListings(payload: Payload, q: SearchQuery): Promise<number> {
  return (await payload.count({ collection: 'listings', where: toWhere(await resolveQuery(payload, q)) })).totalDocs
}

/**
 * FR-SR08 — a live count per option: for each facet group, the listings matching every other
 * filter (the group's own selection left out), counted in memory over a lean select. The catalogue
 * is ~600 listings, so five small reads beat fifty count queries.
 */
export type FacetCounts = {
  propertyFor: Record<string, number>
  type: Record<string, number>
  bedrooms: Record<string, number>
  bathrooms: Record<string, number>
  saleDetail: Record<string, number>
}

export async function facetCounts(payload: Payload, query: SearchQuery): Promise<FacetCounts> {
  const q = await resolveQuery(payload, query)
  const without = (patch: Partial<SearchQuery>, rangeOff?: RangeFacet) => {
    const ranges = { ...q.ranges }
    if (rangeOff) delete ranges[rangeOff]
    return toWhere({ ...q, ...patch, ranges })
  }
  const rows = (where: Where) =>
    payload
      .find({ collection: 'listings', where, pagination: false, depth: 0, select: { propertyForId: true, subTypeId: true, subSubTypeId: true, bedrooms: true, bathrooms: true, saleDetailTypeId: true } })
      .then((r) => r.docs)
  const [pf, types, beds, baths, sale] = await Promise.all([
    rows(without({ propertyFor: null })),
    rows(without({ subTypeIds: [], subSubTypeIds: [] })),
    rows(without({}, 'bedroom')),
    rows(without({}, 'bathroom')),
    rows(without({ saleDetailTypeIds: [] })),
  ])
  const tally = (list: (string | null | undefined)[]) => {
    const out: Record<string, number> = {}
    for (const k of list) if (k) out[k] = (out[k] ?? 0) + 1
    return out
  }
  const atLeast = (values: (number | null | undefined)[]) => {
    const out: Record<string, number> = {}
    for (const n of [1, 2, 3, 4, 5, 6]) out[String(n)] = values.filter((v) => (v ?? 0) >= n).length
    out['6+'] = out['6']
    return out
  }
  return {
    propertyFor: tally(pf.map((d) => d.propertyForId)),
    type: { ...tally(types.map((d) => (d.subTypeId ? `_st_${d.subTypeId}` : null))), ...tally(types.map((d) => (d.subSubTypeId ? `_sst_${d.subSubTypeId}` : null))) },
    bedrooms: atLeast(beds.map((d) => d.bedrooms)),
    bathrooms: atLeast(baths.map((d) => d.bathrooms)),
    saleDetail: tally(sale.map((d) => d.saleDetailTypeId)),
  }
}
