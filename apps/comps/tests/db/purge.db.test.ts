import { execSync } from 'node:child_process'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import type { User } from '@zeta/cms-config/types'
import { beforeAll, describe, expect, it } from 'vitest'

import { createDeal, isFail, trashDeal, type Ctx } from '@/lib/data'
import { cronAuthorized, runPurge } from '@/lib/purge'

// The nightly purge (comps.md C10, app PRD Q5): deals trashed more than 30 days ago are deleted
// for good; newer trash (still undoable) and live deals stay.
const ADMIN = { email: 'db-purge-admin@example.test', password: 'db-test-password-1', name: 'Jong' }
let payload: Payload
let ctx: Ctx

beforeAll(async () => {
  payload = await getPayload({ config })
  const found = await payload.find({ collection: 'users', where: { email: { equals: ADMIN.email } }, overrideAccess: true, limit: 1 })
  const user = (found.docs[0] ??
    (await payload.create({ collection: 'users', data: { ...ADMIN, roles: ['comps-admin'] }, overrideAccess: true }))) as User
  ctx = { payload, user }
  execSync('node --import tsx scripts/seed-sample.ts --reset', {
    cwd: new URL('../..', import.meta.url).pathname,
    env: { ...process.env, ADMIN_EMAIL: ADMIN.email, APP_ENV: process.env.APP_ENV || 'test' },
    stdio: 'pipe',
  })
})

const idOf = async (collection: 'comps-locations' | 'comps-property-types', name: string) =>
  (await payload.find({ collection, where: { name: { equals: name } }, overrideAccess: true, limit: 1 })).docs[0].id

async function trashedDaysAgo(details: string, days: number): Promise<number> {
  const out = await createDeal(ctx, {
    locationId: await idOf('comps-locations', 'Xavier Estates'),
    typeId: await idOf('comps-property-types', 'Residential lot'),
    pin: '8.48930, 124.66200',
    details,
    area: '500',
    price: '15,000,000',
    date: '2026-01-15',
  })
  if (isFail(out)) throw new Error(JSON.stringify(out))
  const id = out.deal.id
  expect(isFail(await trashDeal(ctx, id))).toBe(false)
  const deletedAt = new Date(Date.now() - days * 86_400_000).toISOString()
  await payload.update({ collection: 'comps-deals', id, data: { deletedAt }, trash: true, overrideAccess: true, context: { keepStamps: true } })
  return id
}

const exists = async (id: number) =>
  (await payload.find({ collection: 'comps-deals', where: { id: { equals: id } }, trash: true, overrideAccess: true, limit: 1 })).docs.length === 1

describe('nightly purge (C10)', () => {
  it('deletes deals trashed more than 30 days ago, keeps newer trash and live deals', async () => {
    const old = await trashedDaysAgo('B91 L1', 31)
    const recent = await trashedDaysAgo('B91 L2', 29)
    const live = (await payload.find({ collection: 'comps-deals', overrideAccess: true, limit: 1 })).docs[0].id

    const { purged } = await runPurge(payload)
    expect(purged).toBe(1)
    expect(await exists(old)).toBe(false)
    expect(await exists(recent)).toBe(true)
    expect(await exists(live)).toBe(true)
    // Recorded as a Payload job on the comps queue.
    const jobs = await payload.find({ collection: 'payload-jobs', where: { queue: { equals: 'comps' } }, sort: '-createdAt', limit: 1, overrideAccess: true })
    expect(jobs.docs.every((j) => !j.hasError)).toBe(true) // a finished job is deleted; none may be left failed

    expect((await runPurge(payload)).purged).toBe(0) // nothing left to purge
  })

  it('the cron route is closed without the right secret', () => {
    expect(cronAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true)
    expect(cronAuthorized('Bearer wrong', 's3cret-value')).toBe(false)
    expect(cronAuthorized(null, 's3cret-value')).toBe(false)
    expect(cronAuthorized('Bearer ', '')).toBe(false) // no secret configured: never open
    expect(cronAuthorized('Bearer undefined', undefined)).toBe(false)
  })
})
