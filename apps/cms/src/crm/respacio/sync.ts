import type { Payload } from 'payload'

import { getRespacioClient, type RespacioClient } from './client'
import { fromListItem, withDetail } from './mapper'
import type { CrmListItem } from './types'

/**
 * Full mirror sync: CRM -> Listings. FR-C01, FR-C07.
 *
 * - Idempotent on crmId: create or update, never duplicate.
 * - Never deletes. A record absent from WITHDRAW_AFTER consecutive full syncs is marked
 *   withdrawn; what its public URL then does is pending (withdrawn-listing-url).
 * - Failure is non-fatal to the site: the front end reads only Payload, so a failed sync
 *   leaves the last good mirror serving. The run reports, it does not throw half-way.
 * - Editorial fields (seo, location binding) are never written here, so they survive.
 */

const PAGE_SIZE = 50
const WITHDRAW_AFTER = 2
/** property_for ids seen in the corpus. "3" is unlabelled but real (2 listings). */
const PROPERTY_FOR_IDS = ['1', '2', '3']

export type SyncResult = {
  mode: RespacioClient['mode']
  seen: number
  created: number
  updated: number
  withdrawn: number
  detailsFetched: number
  errors: string[]
}

async function fetchAll(client: RespacioClient, propertyFor: string): Promise<CrmListItem[]> {
  const items: CrmListItem[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await client.listProperties({
      property_for: propertyFor,
      property_per_page: String(PAGE_SIZE),
      property_offset: String(offset),
      language: 'en',
    })
    const page = res.data?.properties ?? []
    items.push(...page)
    if (page.length < PAGE_SIZE) return items
  }
}

export async function syncRespacio(
  payload: Payload,
  opts: { client?: RespacioClient; withDetails?: boolean } = {},
): Promise<SyncResult> {
  const client = opts.client ?? getRespacioClient()
  const result: SyncResult = { mode: client.mode, seen: 0, created: 0, updated: 0, withdrawn: 0, detailsFetched: 0, errors: [] }
  let rates: unknown

  const seenIds = new Set<string>()
  for (const propertyFor of PROPERTY_FOR_IDS) {
    let items: CrmListItem[]
    try {
      items = await fetchAll(client, propertyFor)
    } catch (err) {
      // A failed list pass must not withdraw everything it failed to see.
      result.errors.push(`list property_for=${propertyFor}: ${(err as Error).message}`)
      return result
    }

    for (const item of items) {
      seenIds.add(item.id)
      let data = fromListItem(item)
      if (opts.withDetails ?? true) {
        try {
          const view = await client.viewProperty(item.reference_no, item.property_for_id)
          rates ??= view.currency_converter
          if (view.data?.property_details?.length) {
            data = withDetail(data, view)
            result.detailsFetched++
          }
        } catch (err) {
          result.errors.push(`view ${item.reference_no}: ${(err as Error).message}`)
        }
      }

      const existing = await payload.find({
        collection: 'listings',
        where: { crmId: { equals: item.id } },
        limit: 1,
        depth: 0,
      })
      const doc = { ...data, lastSyncedAt: new Date().toISOString() }
      if (existing.docs[0]) {
        await payload.update({ collection: 'listings', id: existing.docs[0].id, data: doc })
        result.updated++
      } else {
        await payload.create({ collection: 'listings', data: doc })
        result.created++
      }
    }
  }
  result.seen = seenIds.size

  // Anything active we did not see this run moves one step toward withdrawn.
  const unseen = await payload.find({
    collection: 'listings',
    where: { and: [{ crmId: { not_in: [...seenIds] } }, { syncStatus: { equals: 'active' } }] },
    limit: 0,
    pagination: false,
    depth: 0,
  })
  for (const doc of unseen.docs) {
    const missed = (doc.missedSyncs ?? 0) + 1
    await payload.update({
      collection: 'listings',
      id: doc.id,
      data: { missedSyncs: missed, ...(missed >= WITHDRAW_AFTER ? { syncStatus: 'withdrawn' as const } : {}) },
    })
    if (missed >= WITHDRAW_AFTER) result.withdrawn++
  }

  await payload.updateGlobal({
    slug: 'crm-state',
    overrideAccess: true,
    data: {
      ...(rates ? { currencyConverter: rates } : {}),
      lastSyncAt: new Date().toISOString(),
      lastSyncMode: client.mode,
      lastSyncResult: result,
    },
  })
  return result
}
