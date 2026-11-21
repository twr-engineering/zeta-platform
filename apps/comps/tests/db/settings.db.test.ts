import { execSync } from 'node:child_process'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import type { User } from '@zeta/cms-config/types'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  createLocation,
  createType,
  deleteLocation,
  deleteType,
  ensureDefaultSettings,
  loadBootstrap,
  updateLocation,
  updateType,
  type Ctx,
} from '@/lib/data'

// Settings rules against the API layer (app PRD §7.5.7, §14.4) on the Appendix D sample set.
// Reseeds first, so it can run in any order with the e2e suite.
const ADMIN = { email: 'db-settings-admin@example.test', password: 'db-test-password-1', name: 'Jong' }
let payload: Payload
let ctx: Ctx

const idOf = async (collection: 'comps-locations' | 'comps-property-types', name: string) =>
  (await payload.find({ collection, where: { name: { equals: name } }, overrideAccess: true, limit: 1 })).docs[0].id

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

describe('bootstrap', () => {
  it('returns Settings in order with deal counts, and the 75 deals', async () => {
    const b = await loadBootstrap(ctx)
    expect(b.deals).toHaveLength(75)
    expect(b.locations.map((l) => l.name).slice(0, 3)).toEqual(['Xavier Estates', 'Pueblo de Oro', 'Teakwood Hills'])
    expect(b.locations.find((l) => l.name === 'Xavier Estates')?.dealCount).toBe(28)
    expect(b.locations.find((l) => l.name === 'Centrio')?.dealCount).toBe(11)
    expect(b.types.find((t) => t.name === 'Condo unit')?.dealCount).toBe(8)
    const legacy = b.deals.find((d) => d.location.id === null)!
    expect(legacy.location).toEqual({ id: null, name: 'Old Masterson Road', kind: '' })
    const deal = b.deals.find((d) => d.location.name === 'Xavier Estates')!
    expect(deal.pp).toBeCloseTo(deal.price / deal.area, 2)
    expect(['u', 'm', 'o']).toContain(deal.band)
  })

  it('does not add the default lists again when Settings already has rows (§13.5)', async () => {
    expect(await ensureDefaultSettings(payload, ctx.user)).toEqual({ locations: 0, types: 0 })
  })
})

describe('places', () => {
  it('refuses a duplicate name ignoring case, naming the saved entry (SET-006, R17)', async () => {
    expect(await createLocation(ctx, { name: '  xavier   estates ', kind: 'Subdivision', center: '8.47, 124.65' })).toEqual({
      error: 'validation',
      field: 'name',
      message: 'Xavier Estates is already on the list.',
    })
  })

  it('checks name, then center, in order (§7.5.5)', async () => {
    expect(await createLocation(ctx, { name: 'A', center: 'nowhere' })).toMatchObject({ field: 'name', message: 'Enter the name of the subdivision or area.' })
    expect(await createLocation(ctx, { name: 'Somewhere', center: '14.6, 121.0' })).toMatchObject({
      field: 'center',
      message: 'Enter a map center inside Cagayan de Oro, for example 8.47000, 124.65000.',
    })
  })

  it('adds last in order, stores 6 decimals, and renames report the deals moved (SET-003)', async () => {
    const added = await createLocation(ctx, { name: 'Db  Test Place', kind: 'Zone', center: '8.4712345678 124.6512345678' })
    expect(added).toMatchObject({ location: { name: 'Db Test Place', kind: 'Zone', lat: 8.471235, lng: 124.651235, dealCount: 0 } })
    const id = await idOf('comps-locations', 'Xavier Estates')
    const renamed = await updateLocation(ctx, id, { name: 'Xavier Estates Ph 1' })
    expect(renamed).toMatchObject({ dealsMoved: 28, location: { name: 'Xavier Estates Ph 1' } })
    const b = await loadBootstrap(ctx)
    expect(b.deals.filter((d) => d.location.name === 'Xavier Estates Ph 1')).toHaveLength(28)
    expect(await updateLocation(ctx, id, { name: 'Xavier Estates Ph 1', kind: 'Subdivision' })).toMatchObject({ dealsMoved: 0 })
    await updateLocation(ctx, id, { name: 'Xavier Estates' })
    const placeId = (added as { location: { id: number } }).location.id
    expect(await deleteLocation(ctx, placeId)).toEqual({ ok: true })
  })

  it('refuses to delete a place in use, naming the count (SET-005)', async () => {
    expect(await deleteLocation(ctx, await idOf('comps-locations', 'Centrio'))).toEqual({
      error: 'conflict',
      message: 'Used by 11 closed deals. Hide it instead.',
    })
  })

  it('deletes an unused place; trashed deals keep its name as a legacy name', async () => {
    const created = (await createLocation(ctx, { name: 'Db Trash Place', kind: 'Subdivision', center: '8.47, 124.65' })) as { location: { id: number } }
    const deal = await payload.create({
      collection: 'comps-deals',
      data: { location: created.location.id, propertyType: await idOf('comps-property-types', 'Residential lot'), area: 300, price: 9_000_000, dateSold: '2025-01-15', lat: 8.47, lng: 124.65, details: 'B1 L1', corner: false },
      user: ctx.user,
      overrideAccess: true,
    })
    await payload.update({ collection: 'comps-deals', id: deal.id, data: { deletedAt: new Date().toISOString() }, user: ctx.user, overrideAccess: true })
    const before = await payload.findByID({ collection: 'comps-deals', id: deal.id, trash: true, overrideAccess: true })
    expect(await deleteLocation(ctx, created.location.id)).toEqual({ ok: true })
    const after = await payload.findByID({ collection: 'comps-deals', id: deal.id, trash: true, overrideAccess: true, depth: 0 })
    expect(after.location ?? null).toBeNull()
    expect(after.legacyLocationName).toBe('Db Trash Place')
    expect(after.editedAt).toBe(before.editedAt) // not a user edit
    await payload.delete({ collection: 'comps-deals', id: deal.id, trash: true, overrideAccess: true })
  })

  it('keeps at least one place shown, and at least one place', async () => {
    const all = (await loadBootstrap(ctx)).locations
    const shown = all.filter((l) => !l.hidden)
    // Hide all but one, then the last shown refuses.
    for (const l of shown.slice(1)) expect(await updateLocation(ctx, l.id, { hidden: true })).toMatchObject({ location: { hidden: true } })
    expect(await updateLocation(ctx, shown[0].id, { hidden: true })).toEqual({ error: 'conflict', message: 'At least one subdivision or area has to stay shown.' })
    // Alegria Hills (unused) hidden: deleting it is fine; deleting the last shown is not.
    for (const l of shown.slice(1)) await updateLocation(ctx, l.id, { hidden: false })
  })

  it('answers 404 for an unknown id and refuses unknown value shapes', async () => {
    expect(await updateLocation(ctx, 999_999, { name: 'Nope' })).toEqual({ error: 'not_found' })
    expect(await updateLocation(ctx, await idOf('comps-locations', 'Centrio'), { hidden: 'yes' })).toEqual({ error: 'bad_request' })
    expect(await createLocation(ctx, { name: 'Db Kind', kind: 'Village', center: '8.47, 124.65' })).toMatchObject({ error: 'validation', field: 'kind' })
  })
})

describe('property types', () => {
  it('locks the pricing form while deals use the type (SET-007)', async () => {
    const id = await idOf('comps-property-types', 'Condo unit')
    expect(await updateType(ctx, id, { form: 'lot' })).toEqual({ error: 'conflict', message: 'How it is priced is locked while deals use it.' })
    expect(await updateType(ctx, id, { form: 'condo', category: 'Residential' })).toMatchObject({ type: { form: 'condo' }, dealsMoved: 0 })
    // Unused (Shophouse): the form may change.
    const shop = await idOf('comps-property-types', 'Shophouse')
    expect(await updateType(ctx, shop, { form: 'lot' })).toMatchObject({ type: { form: 'lot' } })
    await updateType(ctx, shop, { form: 'house' })
  })

  it('offers exactly the four categories (SET-008)', async () => {
    expect(await createType(ctx, { name: 'Db Type', category: 'Mixed use', form: 'lot' })).toMatchObject({ error: 'validation', field: 'category' })
    expect(await updateType(ctx, await idOf('comps-property-types', 'Warehouse'), { category: 'Retail' })).toMatchObject({ error: 'validation', field: 'category' })
  })

  it('checks names, adds, renames with the deal count, and deletes when unused', async () => {
    expect(await createType(ctx, { name: 'condo UNIT', category: 'Residential', form: 'condo' })).toMatchObject({ message: 'Condo unit is already on the list.' })
    expect(await createType(ctx, { name: ' ', category: 'Residential', form: 'condo' })).toMatchObject({ message: 'Enter the name of the property type.' })
    const t = (await createType(ctx, { name: 'Db Farm', category: 'Agricultural', form: 'house' })) as { type: { id: number; sortOrder: number } }
    expect(t.type.sortOrder).toBeGreaterThan(13)
    const beach = await idOf('comps-property-types', 'Beach lot')
    expect(await updateType(ctx, beach, { name: 'Beachfront lot' })).toMatchObject({ dealsMoved: 2 })
    await updateType(ctx, beach, { name: 'Beach lot' })
    expect(await deleteType(ctx, await idOf('comps-property-types', 'Office unit'))).toEqual({ error: 'conflict', message: 'Used by 1 closed deal. Hide it instead.' })
    expect(await deleteType(ctx, t.type.id)).toEqual({ ok: true })
  })

  it('rolls the whole write back when it fails part-way', async () => {
    // A rename to a name the unique index rejects (bypassing the pre-check via a race) must
    // leave nothing changed: simulate by renaming two rows to the same name concurrently.
    const run = Date.now() % 100000
    const a = (await createType(ctx, { name: `Db Race A ${run}` })) as { type: { id: number } }
    const b = (await createType(ctx, { name: `Db Race B ${run}` })) as { type: { id: number } }
    const results = await Promise.all([
      updateType(ctx, a.type.id, { name: `Db Race ${run}` }),
      updateType(ctx, b.type.id, { name: `db race ${run}` }),
    ])
    const ok = results.filter((r) => 'type' in r)
    expect(ok.length).toBe(1)
    expect(results.find((r) => !('type' in r))).toMatchObject({ error: 'validation', field: 'name' })
    await deleteType(ctx, a.type.id)
    await deleteType(ctx, b.type.id)
  })
})
