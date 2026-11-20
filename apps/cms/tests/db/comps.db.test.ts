import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { CompsDeal, User } from '@/payload-types'

/**
 * Zeta Comps data layer against a real, migrated Postgres:
 * DB-level checks (app PRD DATA-001), audit stamps (DATA-003), trash keeps the stamps
 * (C19 / DATA-003), access through the Local API with a real user.
 */
const run = `t${Date.now().toString(36)}`
let payload: Payload
let comps: User
let editor: User
const created: { collection: 'comps-deals' | 'comps-locations' | 'comps-property-types' | 'users'; id: number }[] = []

const raw = (q: ReturnType<typeof sql>) => (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle.execute(q)
const as = (user: User) => ({ user, overrideAccess: false as const })

beforeAll(async () => {
  payload = await getPayload({ config })
  comps = await payload.create({ collection: 'users', data: { email: `${run}-comps@example.test`, password: `pw-${run}-long-enough`, roles: ['comps-admin'] } })
  editor = await payload.create({ collection: 'users', data: { email: `${run}-editor@example.test`, password: `pw-${run}-long-enough`, roles: ['editor'] } })
  created.push({ collection: 'users', id: comps.id }, { collection: 'users', id: editor.id })
})

afterAll(async () => {
  for (const { collection, id } of created.reverse()) {
    await payload.delete({ collection, id, overrideAccess: true, trash: true }).catch(() => undefined)
  }
})

describe('comps data layer', () => {
  let locationId: number
  let typeId: number
  let deal: CompsDeal

  it('creates settings rows with audit stamps from the signed-in user', async () => {
    const loc = await payload.create({ collection: 'comps-locations', data: { name: `Test Estates ${run}`, kind: 'Subdivision', lat: 8.489, lng: 124.662, sortOrder: 9001, hidden: false }, ...as(comps) })
    const typ = await payload.create({ collection: 'comps-property-types', data: { name: `Test lot ${run}`, form: 'lot', category: 'Residential', sortOrder: 9001, hidden: false }, ...as(comps) })
    created.push({ collection: 'comps-locations', id: loc.id }, { collection: 'comps-property-types', id: typ.id })
    locationId = loc.id
    typeId = typ.id
    expect(typeof loc.createdBy === 'object' ? loc.createdBy?.id : loc.createdBy).toBe(comps.id)
    expect(typeof loc.editedBy === 'object' ? loc.editedBy?.id : loc.editedBy).toBe(comps.id)
    expect(loc.editedAt).toBeTruthy()
  })

  it('refuses a second location whose name differs only by case (R17 backstop)', async () => {
    await expect(
      payload.create({ collection: 'comps-locations', data: { name: `TEST ESTATES ${run}`, kind: 'Zone', lat: 8.48, lng: 124.66, sortOrder: 9002, hidden: false }, ...as(comps) }),
    ).rejects.toThrow()
  })

  it('creates a deal and stamps it', async () => {
    deal = await payload.create({
      collection: 'comps-deals',
      data: { location: locationId, propertyType: typeId, area: 580, price: 21_500_000, dateSold: '2025-02-19', lat: 8.48994, lng: 124.662545, details: 'B22 L27', corner: true },
      ...as(comps),
    })
    created.push({ collection: 'comps-deals', id: deal.id })
    expect(deal.price).toBe(21_500_000)
    expect(typeof deal.createdBy === 'object' ? deal.createdBy?.id : deal.createdBy).toBe(comps.id)
  })

  it.each([
    ['area under 10', 'area', '5'],
    ['fractional peso price', 'price', '21500000.6'],
    ['price per sqm under 100', 'price', '1000'],
    ['date before 2000', 'date_sold', "'1999-12-31'"],
    ['pin outside CDO', 'lat', '9.5'],
    ['lower-case listing code', 'code', "'ztp815'"],
  ])('the database rejects %s (DATA-001)', async (_label, column, value) => {
    await expect(raw(sql.raw(`UPDATE "comps_deals" SET "${column}" = ${value} WHERE "id" = ${deal.id}`))).rejects.toThrow()
  })

  it('the database rejects a deal with both a location and a legacy location name', async () => {
    await expect(raw(sql.raw(`UPDATE "comps_deals" SET "legacy_location_name" = 'Old Road' WHERE "id" = ${deal.id}`))).rejects.toThrow()
  })

  it('trash sets deletedAt/deletedBy only; restore brings back the exact stamps (DATA-003, C19)', async () => {
    const before = await payload.findByID({ collection: 'comps-deals', id: deal.id, depth: 0, overrideAccess: true })
    const trashed = await payload.update({ collection: 'comps-deals', id: deal.id, data: { deletedAt: new Date().toISOString() }, depth: 0, ...as(comps) })
    expect(trashed.deletedAt).toBeTruthy()
    expect(trashed.deletedBy).toBe(comps.id)
    expect(trashed.editedAt).toBe(before.editedAt)
    expect(trashed.editedBy).toBe(before.editedBy)

    const hidden = await payload.find({ collection: 'comps-deals', where: { id: { equals: deal.id } }, depth: 0, ...as(comps) })
    expect(hidden.totalDocs).toBe(0)

    const restored = await payload.update({ collection: 'comps-deals', id: deal.id, data: { deletedAt: null }, trash: true, depth: 0, ...as(comps) })
    expect(restored.deletedAt ?? null).toBeNull()
    expect(restored.deletedBy ?? null).toBeNull()
    expect(restored.editedAt).toBe(before.editedAt)
    expect(restored.editedBy).toBe(before.editedBy)
  })

  it('a real edit moves the edit stamps', async () => {
    const before = await payload.findByID({ collection: 'comps-deals', id: deal.id, depth: 0, overrideAccess: true })
    await new Promise((r) => setTimeout(r, 5))
    const edited = await payload.update({ collection: 'comps-deals', id: deal.id, data: { note: 'beside the clubhouse' }, depth: 0, ...as(comps) })
    expect(edited.editedAt).not.toBe(before.editedAt)
    expect(edited.editedBy).toBe(comps.id)
    expect(edited.createdBy).toBe(before.createdBy)
  })

  it('a CMS editor cannot read comps data through the Local API', async () => {
    await expect(payload.find({ collection: 'comps-deals', depth: 0, ...as(editor) })).rejects.toThrow()
  })
})
