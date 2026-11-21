import { execSync } from 'node:child_process'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import type { User } from '@zeta/cms-config/types'
import { beforeAll, describe, expect, it } from 'vitest'

import { createDeal, isFail, loadBootstrap, restoreDeal, trashDeal, updateDeal, type Ctx, type DealJSON } from '@/lib/data'
import { DEAL_COPY, type DealInput } from '@/lib/deals'

// The deal API layer (app PRD §14.3) against the Appendix D set: every §8.6.3 row answers 422
// with the form's exact copy and field (R4), stamps follow DATA-003, Undo restores the row.
const ADMIN = { email: 'db-deals-admin@example.test', password: 'db-test-password-1', name: 'Jong' }
let payload: Payload
let ctx: Ctx
const id: Record<string, number> = {}

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
  for (const n of ['Xavier Estates', 'Uptown main road, north stretch', 'Uptown back lane']) id[n] = await idOf('comps-locations', n)
  for (const n of ['Residential lot', 'House and lot', 'Condo unit', 'Office unit']) id[n] = await idOf('comps-property-types', n)
})

const base = (): DealInput => ({
  locationId: id['Xavier Estates'],
  typeId: id['Residential lot'],
  pin: '8.48930, 124.66200',
  details: 'B90 L1',
  area: '500',
  price: '15,000,000',
  date: '2026-01-15',
})

describe('POST /api/deals', () => {
  it('creates a deal in the §14.3 shape, stamped as the user', async () => {
    const out = await createDeal(ctx, { ...base(), details: 'B89 L1', corner: true, terrain: 'Flat', frontage: '18', codeOrLink: 'https://zetagroup.ph/r/ztp990/', fin: 'Cash' })
    if (isFail(out)) throw new Error(JSON.stringify(out))
    expect(out.deal).toMatchObject({
      location: { id: id['Xavier Estates'], name: 'Xavier Estates', kind: 'Subdivision' },
      type: { name: 'Residential lot', form: 'lot' },
      area: 500, price: 15_000_000, pp: 30_000, band: 'm', date: '2026-01-15', lat: 8.4893, lng: 124.662,
      details: 'B89 L1', code: 'ZTP990', link: null, corner: true, terrain: 'Flat', frontage: 18, fin: 'Cash',
      createdBy: ctx.user.id, updatedBy: ctx.user.id,
    })
  })

  const rows: [string, DealInput, string, string][] = [
    ['1', { pin: 'abc' }, 'pin', DEAL_COPY.pinParse],
    ['2', { pin: '9.1, 124.6' }, 'pin', DEAL_COPY.pinOut],
    ['3', { locationId: null }, 'locationId', DEAL_COPY.noLocation],
    ['3 (unknown id)', { locationId: 999999 }, 'locationId', DEAL_COPY.noLocation],
    ['4', { details: '' }, 'details', DEAL_COPY.detailsOther],
    ['5', { area: '' }, 'area', 'Enter the lot area in sqm.'],
    ['6 (ADD-002)', { area: '5' }, 'area', 'Check the lot area. It should be between 10 and 1,000,000 sqm.'],
    ['7', { typeId: 0, area: '200' }, 'lotArea', DEAL_COPY.lotAreaMissing],
    ['8', { typeId: 0, area: '200', lotArea: '5' }, 'lotArea', DEAL_COPY.areaRange(true)],
    ['9', { frontage: '3000' }, 'frontage', DEAL_COPY.frontageRange],
    ['10 (ADD-003)', { locationId: -1, details: '' }, 'frontage', 'A lot outside a subdivision needs its frontage in metres.'],
    ['11', { price: '' }, 'price', DEAL_COPY.priceMissing],
    ['12 (ADD-004)', { details: 'b22-l27', price: '21500000', area: '580' }, 'details', 'This looks like a deal already saved: same location, b22-l27 and sold price. Check the deal list before adding it again.'],
    ['13', { date: '' }, 'date', DEAL_COPY.dateMissing],
    ['14', { date: '2999-01-01' }, 'date', DEAL_COPY.dateFuture],
    ['15', { date: '1999-12-31' }, 'date', DEAL_COPY.dateOld],
    ['16', { price: '20000' }, 'price', 'That works out to ₱40 per sqm, which looks wrong. Check the area and the sold price.'],
    ['17', { dom: '-1' }, 'dom', DEAL_COPY.dom],
    ['18', { asking: '1000' }, 'asking', DEAL_COPY.asking],
    ['19', { typeId: 0, area: '200', lotArea: '300', year: '1800' }, 'year', DEAL_COPY.year],
    ['20', { typeId: -2, floor: '0' }, 'floor', DEAL_COPY.floor],
    ['21', { codeOrLink: 'http://bad link' }, 'codeOrLink', DEAL_COPY.link],
  ]
  it.each(rows)('row %s answers 422 with the exact copy and field', async (_, over, field, message) => {
    const input = { ...base(), ...over }
    if (over.typeId === 0) input.typeId = id['House and lot']
    if (over.typeId === -2) input.typeId = id['Condo unit']
    if (over.locationId === -1) input.locationId = id['Uptown main road, north stretch']
    expect(await createDeal(ctx, input)).toEqual({ error: 'validation', field, message })
  })

  it('accepts a hidden place and a hidden type (§14.3)', async () => {
    const out = await createDeal(ctx, { ...base(), locationId: id['Uptown back lane'], typeId: id['Office unit'], details: '', area: '80', price: '8,000,000', floor: '3' })
    expect(isFail(out)).toBe(false)
  })

  it('refuses a legacy name on create, and malformed input as 400', async () => {
    expect(await createDeal(ctx, { ...base(), locationId: null, legacyLocationName: 'Old Masterson Road' })).toMatchObject({ field: 'locationId' })
    expect(await createDeal(ctx, { ...base(), fin: 'Barter' })).toEqual({ error: 'bad_request' })
    expect(await createDeal(ctx, { ...base(), typeId: 999999 })).toEqual({ error: 'bad_request' })
  })
})

describe('PUT, DELETE and restore', () => {
  let deal: DealJSON
  beforeAll(async () => {
    const out = await createDeal(ctx, { ...base(), details: 'B91 L1' })
    if (isFail(out)) throw new Error(JSON.stringify(out))
    deal = out.deal
  })

  it('replaces values, drops fields that no longer apply, keeps the created stamps (ADD-012)', async () => {
    await new Promise((r) => setTimeout(r, 20))
    const out = await updateDeal(ctx, deal.id, { ...base(), details: 'B91 L1', typeId: id['House and lot'], area: '200', lotArea: '300', corner: true, beds: '3' })
    if (isFail(out)) throw new Error(JSON.stringify(out))
    expect(out.deal).toMatchObject({ id: deal.id, type: { name: 'House and lot' }, lotArea: 300, beds: 3, corner: false, terrain: null, createdAt: deal.createdAt, createdBy: deal.createdBy })
    expect(out.deal.updatedAt > deal.updatedAt).toBe(true)
    deal = out.deal
  })

  it('does not count the edited deal as its own duplicate', async () => {
    const out = await updateDeal(ctx, deal.id, { ...base(), details: 'b91-l1', typeId: id['House and lot'], area: '200', lotArea: '300' })
    if (isFail(out)) throw new Error(JSON.stringify(out))
    deal = out.deal
  })

  it('keeps a legacy name when editing a legacy deal', async () => {
    const legacy = (await loadBootstrap(ctx)).deals.find((d) => d.location.id === null)!
    const out = await updateDeal(ctx, legacy.id, {
      legacyLocationName: legacy.location.name, typeId: legacy.type.id, legacyTypeName: legacy.type.id === null ? legacy.type.name : null,
      pin: `${legacy.lat}, ${legacy.lng}`, details: legacy.details, area: legacy.area, lotArea: legacy.lotArea, frontage: legacy.frontage,
      price: legacy.price, date: legacy.date, note: 'edited',
    })
    if (isFail(out)) throw new Error(JSON.stringify(out))
    expect(out.deal.location).toEqual({ id: null, name: legacy.location.name, kind: '' })
    expect(out.deal.note).toBe('edited')
  })

  it('soft deletes; a deleted deal is 404 for edit and delete; restore brings back the exact stamps (DATA-003)', async () => {
    expect(await trashDeal(ctx, deal.id)).toEqual({ id: deal.id })
    expect((await loadBootstrap(ctx)).deals.some((d) => d.id === deal.id)).toBe(false)
    expect(await updateDeal(ctx, deal.id, base())).toEqual({ error: 'not_found' })
    expect(await trashDeal(ctx, deal.id)).toEqual({ error: 'not_found' })
    const out = await restoreDeal(ctx, deal.id)
    if (isFail(out)) throw new Error(JSON.stringify(out))
    expect(out.deal).toMatchObject({ id: deal.id, createdAt: deal.createdAt, createdBy: deal.createdBy, updatedAt: deal.updatedAt, updatedBy: deal.updatedBy })
    const raw = await payload.findByID({ collection: 'comps-deals', id: deal.id, overrideAccess: true, depth: 0 })
    expect(raw.deletedAt ?? null).toBeNull()
    expect(raw.deletedBy ?? null).toBeNull()
    expect(await restoreDeal(ctx, 999999)).toEqual({ error: 'not_found' })
  })
})
