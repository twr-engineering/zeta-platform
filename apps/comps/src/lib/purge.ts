import { timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

/**
 * The nightly purge (comps.md C10, app PRD Q5): queues the shared config's `compsPurgeTrash` task
 * on the `comps` queue and runs that queue, so the run is recorded as a Payload job. Not
 * server-only, so db tests can call it.
 */
export async function runPurge(payload: Payload): Promise<{ purged: number }> {
  // Payload deletes a job once it completes, so the count comes from the rows themselves.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const old = () =>
    payload.count({ collection: 'comps-deals', trash: true, where: { deletedAt: { less_than: cutoff } }, overrideAccess: true }).then((r) => r.totalDocs)
  const before = await old()
  const job = await payload.jobs.queue({ task: 'compsPurgeTrash', input: {}, queue: 'comps' })
  const res = await payload.jobs.run({ queue: 'comps' })
  const status = res.jobStatus?.[String(job.id)]?.status
  if (status && status !== 'success') throw new Error(`compsPurgeTrash ended with status ${status}`)
  const left = await old()
  if (left > 0) throw new Error(`compsPurgeTrash left ${left} deal(s) older than 30 days`)
  return { purged: before }
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` (ADR-17). Without the secret configured
 * the route is closed, never open. Compared in constant time.
 */
export function cronAuthorized(header: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !header) return false
  const want = Buffer.from(`Bearer ${secret}`)
  const got = Buffer.from(header)
  return got.length === want.length && timingSafeEqual(got, want)
}
