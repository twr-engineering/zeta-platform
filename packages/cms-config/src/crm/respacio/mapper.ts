import type { Listing } from '@/payload-types'

import type { CrmListItem, CrmPhoto, CrmPropertyDetail, CrmViewResponse } from './types'

/**
 * CRM record -> Listings document. Pure; no I/O.
 *
 * List items carry labels only (pro_sub_type: "House"); properties/view carries ids
 * (property_sub_type_id: "9"). Search filters on ids (`type[]=_st_9`, BPM-012), so a list
 * item's ids are resolved through the tables below until the sync has fetched its detail.
 *
 * MEASURED from the 73 resolved properties/view fixtures, every pair 1:1 in the corpus.
 * Labels absent from this table (Industrial, Condotel) map to null until a detail is fetched.
 */
export const SUB_TYPE_IDS: Record<string, string> = {
  'Hospitality & Leisure': '5',
  Commercial: '7',
  'Residential Land': '8',
  House: '9',
  Apartment: '10',
  Condominium: '38',
  Agricultural: '53',
}

/** sale_detail_type_id. "New Development" is what BPM-012 calls Preselling. */
export const SALE_DETAIL_TYPE_IDS: Record<string, string> = {
  Resale: '1',
  'New Development': '2',
}

type ListingData = Omit<Listing, 'id' | 'createdAt' | 'updatedAt' | 'sizes'>

/** The CRM sends "" and null interchangeably for absent. */
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const num = (v: unknown): number | null => {
  const s = str(v)
  if (s === null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const date = (v: unknown): string | null => {
  const s = str(v)
  // CRM timestamps are "YYYY-MM-DD HH:MM:SS" with no zone; treated as UTC.
  return s ? new Date(`${s.replace(' ', 'T')}Z`).toISOString() : null
}

export function fromListItem(item: CrmListItem): ListingData {
  const subTypeName = str(item.pro_sub_type)
  const saleDetailType = str(item.sale_detail_type)
  return {
    crmId: item.id,
    referenceNo: item.reference_no,
    propertyTitle: str(item.title),
    shortDescription: str(item.short_decriptions),
    description: str(item.decriptions),
    // format_price reads default_price, not price (BPM-008, search-results.php:1485).
    price: num(item.default_price) ?? num(item.price),
    currencyCode: str(item.currency_code) ?? 'PHP',
    propertyForId: item.property_for_id,
    propertyFor: str(item.property_for),
    typeName: str(item.pro_type),
    subTypeId: subTypeName ? (SUB_TYPE_IDS[subTypeName] ?? null) : null,
    subTypeName,
    saleDetailTypeId: saleDetailType ? (SALE_DETAIL_TYPE_IDS[saleDetailType] ?? null) : null,
    saleDetailType,
    rentAmountPeriod: str(item.rent_amount_period),
    priority: num(item.priority) ?? 0,
    bedrooms: num(item.bedrooms),
    bathrooms: num(item.bathrooms),
    builtSize: num(item.built_size),
    plotSize: num(item.plot_size),
    areaUnit: str(item.area_unit),
    geo: {
      latitude: num(item.latitude),
      longitude: num(item.longitude),
      provinceName: str(item.province_name),
      municipalityName: str(item.municipality_name),
      cityName: str(item.city_name),
      complexName: str(item.complex_name),
    },
    images: [str(item.detail_image) ?? str(item.image)].filter((u): u is string => !!u).map((url) => ({ url })),
    features: (str(item.feature) ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
      .map((name) => ({ name })),
    crmModifiedAt: date(item.modified_datetime),
    crmPayload: { list: item },
    syncStatus: 'active',
    missedSyncs: 0,
  }
}

/**
 * `attributes` / `features` arrive as [{ name: "Views", Views: { "131": "Golf Course" } }].
 * Attribute value ids are what `fa[]=a{n}` filters on (a131 = Golf Course, a145 = Beachfront).
 */
export function parseGroups(raw: unknown): { crmId: string; name: string; group: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((g: Record<string, unknown>) => {
    const group = String(g.name ?? '')
    const values = g[group]
    if (!values || typeof values !== 'object' || Array.isArray(values)) return []
    return Object.entries(values as Record<string, string>).map(([crmId, name]) => ({ crmId, name, group }))
  })
}

/**
 * Overlay a properties/view response onto a list-item mapping. Detail wins wherever it
 * carries the field, because it is the only source of the ids.
 */
export function withDetail(base: ListingData, view: CrmViewResponse): ListingData {
  const d: CrmPropertyDetail | undefined = view.data?.property_details?.[0]
  if (!d) return base
  const photos: CrmPhoto[] = view.data?.photos ?? []
  const attributes = parseGroups(view.data?.attributes)
  const photoUrls = photos.map((p) => str(p.big_image_path)).filter((u): u is string => !!u)
  return {
    ...base,
    propertyTitle: str(d.property_title) ?? base.propertyTitle,
    shortDescription: str(d.short_description) ?? base.shortDescription,
    description: str(d.description) ?? base.description,
    price: num(d.default_price) ?? num(d.price) ?? base.price,
    subTypeId: str(d.property_sub_type_id) ?? base.subTypeId,
    subTypeName: str(d.property_sub_name) ?? base.subTypeName,
    saleDetailTypeId: str(d.sale_detail_type_id) ?? base.saleDetailTypeId,
    saleDetailType: str(d.sale_detail_type) ?? base.saleDetailType,
    rentAmountPeriod: str(d.rent_amount_period) ?? base.rentAmountPeriod,
    priority: num(d.priority) ?? base.priority,
    isFeatured: d.is_featured === '1',
    geo: {
      ...base.geo,
      latitude: num(d.latitude) ?? base.geo?.latitude,
      longitude: num(d.longitude) ?? base.geo?.longitude,
      provinceId: str(d.province_id),
      municipalityId: str(d.municipality_id),
      townId: str(d.town_id),
      complexId: str(d.complex_id),
    },
    images: photoUrls.length ? photoUrls.map((url) => ({ url })) : base.images,
    attributes: attributes.length ? attributes : base.attributes,
    crmModifiedAt: date(d.modified_date) ?? base.crmModifiedAt,
    crmPayload: { ...(base.crmPayload as object), view: view.data },
  }
}
