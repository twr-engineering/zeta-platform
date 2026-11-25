import type { Payload } from 'payload'

import { getRespacioClient, type RespacioClient } from './client'
import { fromListItem, withDetail } from './mapper'
import type { CrmListItem, CrmLocationTree } from './types'

/**
 * Mirror sync: CRM -> Listings. FR-C01, FR-C07.
 *
 * - Idempotent on crmId: create or update, never duplicate.
 * - Never deletes. A record absent from WITHDRAW_AFTER consecutive complete cycles is marked
 *   withdrawn; what its public URL then does is pending (withdrawn-listing-url).
 * - Failure is non-fatal to the site: the front end reads only Payload, so a failed sync
 *   leaves the last good mirror serving. A run reports, it does not throw half-way.
 * - Editorial fields (seo, location binding) are never written here, so they survive.
 *
 * Resumable: the live CRM answers ~0.35 s per listing on list calls (a 50-item page takes ~16 s)
 * and ~2.5 s per detail, so one complete pass (~3 min of list calls alone) does not fit a
 * serverless request. `syncRespacioStep` works through list pages until its time budget is spent,
 * saving its place in crm-state.syncCursor after every page; the next step continues there. A
 * finished cycle withdraws what it never saw and refreshes the location tree and rates.
 * `syncRespacio` runs steps until a cycle completes (the CLI, fixtures, tests).
 */

const PAGE_SIZE = 50
const WITHDRAW_AFTER = 2
/** property_for ids seen in the corpus. "3" is unlabelled but real (2 listings). */
const PROPERTY_FOR_IDS = ['1', '2', '3']
/**
 * Details are fetched only when a listing is new, its list `modified_datetime` changed, or its
 * stored detail is older than DETAIL_MAX_AGE_MS. Stale-only refreshes are capped per step (new and
 * changed listings never are), so a step stays short while every detail still renews daily.
 */
const DETAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000
const STALE_REFRESH_CAP = 10

export type SyncResult = {
  mode: RespacioClient['mode']
  seen: number
  created: number
  updated: number
  withdrawn: number
  detailsFetched: number
  /** Unchanged listings rebuilt from their stored detail instead of a new request. */
  detailsReused: number
  /** Listings skipped entirely: identical list data, reused detail, already active. */
  unchanged: number
  errors: string[]
}

export type SyncCursor = { cycleStartedAt: string; pfIndex: number; offset: number; seen: string[] }
export type StepResult = SyncResult & { done: boolean; pages: number; cursor: SyncCursor | null }

/** JSON with object keys sorted: jsonb reorders keys, so a plain stringify never matches the stored copy. */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(v ?? null)

type StoredPayload = { list?: { modified_datetime?: string | null }; view?: unknown; viewFetchedAt?: string }

const emptyResult = (mode: RespacioClient['mode']): SyncResult => ({
  mode,
  seen: 0,
  created: 0,
  updated: 0,
  withdrawn: 0,
  detailsFetched: 0,
  detailsReused: 0,
  unchanged: 0,
  errors: [],
})

/**
 * One budgeted step of the sync. Starts a new cycle when there is no saved cursor. `budgetMs`
 * bounds when a new list page may start (a page in progress always completes).
 */
export async function syncRespacioStep(
  payload: Payload,
  opts: { client?: RespacioClient; withDetails?: boolean; staleRefreshCap?: number; budgetMs?: number } = {},
): Promise<StepResult> {
  const client = opts.client ?? getRespacioClient()
  const started = Date.now()
  const budget = opts.budgetMs ?? Number.POSITIVE_INFINITY
  const result = emptyResult(client.mode)
  let staleBudget = opts.staleRefreshCap ?? STALE_REFRESH_CAP
  let rates: unknown
  let pages = 0

  const state = await payload.findGlobal({ slug: 'crm-state', depth: 0, overrideAccess: true })
  const saved = state.syncCursor as SyncCursor | null | undefined
  const cursor: SyncCursor = saved?.cycleStartedAt ? { ...saved, seen: [...(saved.seen ?? [])] } : { cycleStartedAt: new Date().toISOString(), pfIndex: 0, offset: 0, seen: [] }
  const seen = new Set(cursor.seen)

  // Every listing's stored state in one read, instead of one lookup per CRM item.
  const known = new Map(
    (
      await payload.find({ collection: 'listings', pagination: false, depth: 0, select: { crmId: true, crmPayload: true, syncStatus: true, missedSyncs: true } })
    ).docs.map((d) => [d.crmId, d]),
  )

  const saveCursor = (c: SyncCursor | null) =>
    payload.updateGlobal({ slug: 'crm-state', overrideAccess: true, data: { syncCursor: c, lastStepAt: new Date().toISOString() } as never })

  while (cursor.pfIndex < PROPERTY_FOR_IDS.length && Date.now() - started < budget) {
    const propertyFor = PROPERTY_FOR_IDS[cursor.pfIndex]
    let page: CrmListItem[]
    try {
      const res = await client.listProperties({
        property_for: propertyFor,
        property_per_page: String(PAGE_SIZE),
        property_offset: String(cursor.offset),
        language: 'en',
      })
      page = res.data?.properties ?? []
    } catch (err) {
      // A failed list call keeps the cursor: the next step retries this page; nothing is withdrawn.
      result.errors.push(`list property_for=${propertyFor} offset=${cursor.offset}: ${(err as Error).message}`)
      await saveCursor({ ...cursor, seen: [...seen] })
      return { ...result, seen: seen.size, done: false, pages, cursor: { ...cursor, seen: [...seen] } }
    }

    for (const item of page) {
      seen.add(item.id)
      let data = fromListItem(item)
      const prev = known.get(item.id)
      const stored = (prev?.crmPayload ?? {}) as StoredPayload
      const unchanged = !!stored.view && stored.list?.modified_datetime === item.modified_datetime
      const fetchedAt = stored.viewFetchedAt ? Date.parse(stored.viewFetchedAt) : 0
      const stale = Date.now() - fetchedAt > DETAIL_MAX_AGE_MS
      let fetch = (opts.withDetails ?? true) && (!unchanged || (stale && staleBudget > 0))
      if (fetch && unchanged) staleBudget--
      if (fetch) {
        try {
          const view = await client.viewProperty(item.reference_no, item.property_for_id)
          rates ??= view.currency_converter
          if (view.data?.property_details?.length) {
            data = withDetail(data, view)
            data = { ...data, crmPayload: { ...(data.crmPayload as object), viewFetchedAt: new Date().toISOString() } }
            result.detailsFetched++
          }
        } catch (err) {
          result.errors.push(`view ${item.reference_no}: ${(err as Error).message}`)
          fetch = false
        }
      }
      if (!fetch && stored.view) {
        // Keep the last detail (and when it was fetched) rather than dropping to the list fields.
        data = withDetail(data, { data: stored.view } as Parameters<typeof withDetail>[1])
        data = { ...data, crmPayload: { ...(data.crmPayload as object), viewFetchedAt: stored.viewFetchedAt } }
        result.detailsReused++
      }

      // Nothing to write: identical CRM list data, the stored detail reused, already active.
      // Writing would rewrite every photo row for nothing.
      if (prev && !fetch && stored.view && canonical(stored.list) === canonical(item) && prev.syncStatus === 'active' && !prev.missedSyncs) {
        result.unchanged++
        continue
      }
      const doc = { ...data, lastSyncedAt: new Date().toISOString() }
      if (prev) {
        await payload.update({ collection: 'listings', id: prev.id, data: doc })
        result.updated++
      } else {
        await payload.create({ collection: 'listings', data: doc })
        result.created++
      }
    }

    pages++
    if (page.length < PAGE_SIZE) {
      cursor.pfIndex++
      cursor.offset = 0
    } else {
      cursor.offset += PAGE_SIZE
    }
    await saveCursor({ ...cursor, seen: [...seen] })
  }

  if (cursor.pfIndex < PROPERTY_FOR_IDS.length) {
    if (rates) await payload.updateGlobal({ slug: 'crm-state', overrideAccess: true, data: { currencyConverter: rates } })
    return { ...result, seen: seen.size, done: false, pages, cursor: { ...cursor, seen: [...seen] } }
  }

  // ---- cycle complete -----------------------------------------------------------------------
  result.seen = seen.size
  // Anything active this whole cycle did not see moves one step toward withdrawn.
  const unseen = await payload.find({
    collection: 'listings',
    where: { and: [{ crmId: { not_in: [...seen] } }, { syncStatus: { equals: 'active' } }] },
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

  // The search picker's location tree (FR-SR02 area). A failure keeps the last stored tree.
  let locationTree: CrmLocationTree | undefined
  try {
    const tree = await client.locationTree()
    if (tree.data?.length) locationTree = tree
  } catch (err) {
    result.errors.push(`location tree: ${(err as Error).message}`)
  }

  await payload.updateGlobal({
    slug: 'crm-state',
    overrideAccess: true,
    data: {
      ...(rates ? { currencyConverter: rates } : {}),
      ...(locationTree ? { locationTree } : {}),
      syncCursor: null,
      lastStepAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      lastSyncMode: client.mode,
      lastSyncResult: result,
    } as never,
  })
  return { ...result, done: true, pages, cursor: null }
}

/** A complete cycle: steps until done (the CLI and tests). Totals are summed across steps. */
export async function syncRespacio(
  payload: Payload,
  opts: { client?: RespacioClient; withDetails?: boolean; staleRefreshCap?: number } = {},
): Promise<SyncResult> {
  const total = emptyResult((opts.client ?? getRespacioClient()).mode)
  for (let i = 0; i < 100; i++) {
    const step = await syncRespacioStep(payload, opts)
    for (const k of ['created', 'updated', 'withdrawn', 'detailsFetched', 'detailsReused', 'unchanged'] as const) total[k] += step[k]
    total.errors.push(...step.errors)
    total.seen = step.seen
    if (step.done || step.errors.some((e) => e.startsWith('list '))) return total
  }
  total.errors.push('sync did not complete within 100 steps')
  return total
}
