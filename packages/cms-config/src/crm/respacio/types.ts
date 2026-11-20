/**
 * Respacio CRM wire types.
 *
 * MEASURED from the 1,554 cached calls in wp_curl_info (tests/fixtures/respacio/). The CRM
 * returns every scalar as a string — numbers, flags and ids alike — and uses `""` or `null`
 * interchangeably for "absent". Nothing here is coerced; that is the mapper's job.
 *
 * Only fields the build reads are named. Everything else is still present at runtime and is
 * kept verbatim in Listings.crmPayload.
 */

/** EUR-based rates shipped on every response. The only FX source the site has (BPM-008). */
export type CurrencyConverter = Record<string, string>

type Envelope = {
  status: 'success' | string
  message?: string
  is_record?: number
  currency_converter?: CurrencyConverter
  currency_code?: string
  default_currency_code?: string
}

/** One item of `properties` / `properties/filter_property` — 92 fields. */
export type CrmListItem = {
  id: string
  reference_no: string
  title: string | null
  short_decriptions: string | null
  decriptions: string | null
  price: string | null
  default_price: string | null
  currency_code: string | null
  /** "1" Sale, "2" Rent, "3" seen twice and unlabelled in the corpus. */
  property_for_id: string
  property_for: string | null
  /** Labels only on list items — the ids arrive on properties/view. */
  pro_type: string | null
  pro_sub_type: string | null
  pro_subsub_type: string | null
  sale_detail_type: string | null
  rent_amount_period: string | null
  priority: string | null
  bedrooms: string | null
  bathrooms: string | null
  built_size: string | null
  plot_size: string | null
  area_unit: string | null
  latitude: string | null
  longitude: string | null
  province_name: string | null
  municipality_name: string | null
  city_name: string | null
  complex_name: string | null
  image: string | null
  detail_image: string | null
  feature: string | null
  modified_datetime: string | null
  [field: string]: unknown
}

/** `property_details[0]` of `properties/view` — 113 fields. */
export type CrmPropertyDetail = {
  id: string
  reference_no: string
  property_title: string | null
  short_description: string | null
  description: string | null
  price: string | null
  default_price: string | null
  currency_code: string | null
  property_for_id: string
  property_for: string | null
  property_sub_type_id: string | null
  property_sub_name: string | null
  sale_detail_type_id: string | null
  sale_detail_type: string | null
  rent_amount_period: string | null
  priority: string | null
  is_featured: string | null
  bedrooms: string | null
  bathrooms: string | null
  built_size: string | null
  plot_size: string | null
  latitude: string | null
  longitude: string | null
  province_id: string | null
  municipality_id: string | null
  town_id: string | null
  complex_id: string | null
  complex_name: string | null
  provience_name: string | null
  municipality_name: string | null
  city_name: string | null
  modified_date: string | null
  [field: string]: unknown
}

export type CrmPhoto = { big_image_path?: string; file_name?: string; [field: string]: unknown }

export type CrmListResponse = Envelope & {
  total_records?: number
  data?: { properties?: CrmListItem[] }
}

export type CrmViewResponse = Envelope & {
  data?: {
    property_details?: CrmPropertyDetail[]
    photos?: CrmPhoto[]
    [collection: string]: unknown
  }
}

/** Query params exactly as the WordPress plugin sends them (array keys included). */
export type CrmParams = Record<string, string | string[]>
