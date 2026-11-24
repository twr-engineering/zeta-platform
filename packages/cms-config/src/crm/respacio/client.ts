import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { pending } from '@zeta/parity/pending'

import type { CrmListItem, CrmListResponse, CrmLocationTree, CrmParams, CrmViewResponse } from './types'

/**
 * Respacio CRM client. The ONLY module that talks to crm.respacio.com (PRD §15.5).
 *
 * Wire contract, read from plugins/respacio/includes/functions.php:66–125:
 *   base        prop_options.property_api_url, in production https://crm.respacio.com/ws/
 *   auth        `x-api-key: {property_verification_key}` plus a fixed vendor header
 *               `authorization: Basic YWRtaW46MTIzNA==` ("admin:1234") on every call
 *   GET         params as a query string via http_build_query
 *
 * Two transports:
 *   live      — real HTTP. Needs RESPACIO_API_KEY. In Claude Code cloud sessions set it as a
 *               *network secret* scoped to crm.respacio.com so the key never enters the VM.
 *   fixtures  — replays tests/fixtures/respacio/, the golden-master corpus extracted from the
 *               production cache. Default until live access exists (pending: respacio-credentials).
 *
 * The front end never imports this. It reads Payload; only the sync reaches the CRM.
 */

export type RespacioClient = {
  mode: 'live' | 'fixtures'
  listProperties(params: CrmParams): Promise<CrmListResponse>
  viewProperty(referenceNo: string, propertyFor: string): Promise<CrmViewResponse>
  /** The search picker's location tree (province → municipality → town → complex). */
  locationTree(): Promise<CrmLocationTree>
}

const VENDOR_BASIC_AUTH = 'Basic YWRtaW46MTIzNA=='
const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/respacio')

/** PHP http_build_query for the shapes the plugin sends: scalars and `key[]` arrays. */
export function buildQuery(params: CrmParams): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
    else qs.append(key, value)
  }
  return qs.toString()
}

function liveClient(apiKey: string, baseUrl: string): RespacioClient {
  const get = async <T>(wsName: string, params: CrmParams): Promise<T> => {
    const url = `${baseUrl.replace(/\/$/, '')}/${wsName}?${buildQuery(params)}`
    const res = await fetch(url, {
      headers: { authorization: VENDOR_BASIC_AUTH, 'x-api-key': apiKey },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Respacio ${wsName} HTTP ${res.status}`)
    return (await res.json()) as T
  }
  return {
    mode: 'live',
    listProperties: (params) => get('properties', params),
    viewProperty: (referenceNo, propertyFor) =>
      get('properties/view', { property_reference: referenceNo, property_for: propertyFor, language: 'en' }),
    // The site's respacio_miscLocationinactive is "yes" (not "all"), so the plugin sends
    // get_inactive_location=1 (functions.php:5663–5666).
    locationTree: () => get('properties/province_municipality_city_complex', { lang_code: 'en', get_inactive_location: '1' }),
  }
}

function fixtureClient(): RespacioClient {
  let listings: Promise<CrmListItem[]> | undefined
  const loadListings = () =>
    (listings ??= readFile(path.join(FIXTURES_DIR, 'listings.json'), 'utf8').then((s) => JSON.parse(s)))

  return {
    mode: 'fixtures',
    async listProperties(params) {
      // The corpus has no single complete list call, so the fixture transport answers with the
      // union of every listing ever cached, paged with the same offset/per-page params the live
      // API takes. Filtering is not replayed here — that is the search layer's job, tested
      // against search-calls.json.
      const all = await loadListings()
      const forId = typeof params.property_for === 'string' ? params.property_for : undefined
      const scoped = forId ? all.filter((p: CrmListItem) => p.property_for_id === forId) : all
      const offset = Number(params.property_offset ?? 0)
      const perPage = Number(params.property_per_page ?? scoped.length)
      return {
        status: 'success',
        total_records: scoped.length,
        currency_converter: { EUR: '1.0000000000', USD: '1.1687567934', PHP: '72.1823096972' },
        data: { properties: scoped.slice(offset, offset + perPage) },
      }
    },
    async locationTree() {
      return JSON.parse(await readFile(path.join(FIXTURES_DIR, 'location-tree.json'), 'utf8'))
    },
    async viewProperty(referenceNo) {
      try {
        return JSON.parse(await readFile(path.join(FIXTURES_DIR, 'details', `${referenceNo}.json`), 'utf8'))
      } catch {
        // Matches the live CRM's own miss response.
        return { status: 'success', is_record: 0, message: 'Property details not found.' }
      }
    },
  }
}

export function getRespacioClient(): RespacioClient {
  const apiKey = process.env.RESPACIO_API_KEY
  const mode = process.env.RESPACIO_MODE ?? (apiKey ? 'live' : 'fixtures')
  if (mode === 'live') {
    if (!apiKey) throw new Error('RESPACIO_MODE=live needs RESPACIO_API_KEY')
    return liveClient(apiKey, process.env.RESPACIO_API_URL ?? 'https://crm.respacio.com/ws/')
  }
  pending('respacio-credentials')
  return fixtureClient()
}
