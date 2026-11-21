/**
 * npm run seed:sample (app PRD Appendix D, NFR-008): development and staging only.
 * 1. Makes sure the default Settings lists exist (§13.5), then adds the 4 test entries (D.2).
 * 2. Deletes every deal (trashed ones too), then inserts the 75 fixture deals with dates
 *    resolved relative to today in Asia/Manila (D.3). The 71 non-direct deals go through
 *    createDeal (the API's rules and record builder); the 4 DB-direct ones are written as-is.
 * Stamps are the admin (the comps-admin from seed:admin, or the first one found).
 * `--reset` also deletes every Settings row first, so the lists are exactly the defaults plus
 * D.2 (the test suites use it; without it, Settings edits made in the app are kept).
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import type { CompsDeal } from '@zeta/cms-config/types'

import fixture from './fixtures/sample-deals.json' with { type: 'json' }
import { createDeal, ensureDefaultSettings, isFail } from '../src/lib/data'
import type { DealInput } from '../src/lib/deals'
import { resolveSeedDate, type SeedDate } from '../src/lib/seed-dates'

if (process.env.APP_ENV === 'production' || !process.env.APP_ENV) {
  console.error('seed:sample refuses to run without APP_ENV, or with APP_ENV=production (NFR-008).')
  process.exit(1)
}

type FixtureDeal = Record<string, unknown> & { ref: string; dateSold: SeedDate; loc?: string; type?: string; legacyLocationName?: string; legacyTypeName?: string }

const payload = await getPayload({ config })
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const admins = await payload.find({
  collection: 'users',
  where: email ? { email: { equals: email } } : { roles: { contains: 'comps-admin' } },
  sort: 'createdAt',
  limit: 1,
  overrideAccess: true,
})
const admin = admins.docs[0]
if (!admin) {
  console.error('seed:sample needs the admin first: run seed:admin.')
  process.exit(1)
}
const opts = { user: admin, overrideAccess: true as const }

await payload.delete({ collection: 'comps-deals', where: { id: { exists: true } }, trash: true, ...opts })
if (process.argv.includes('--reset')) {
  await payload.delete({ collection: 'comps-locations', where: { id: { exists: true } }, ...opts })
  await payload.delete({ collection: 'comps-property-types', where: { id: { exists: true } }, ...opts })
}
await ensureDefaultSettings(payload, admin)

// D.2 test entries: added once, then left as they are.
const locs = await payload.find({ collection: 'comps-locations', pagination: false, ...opts })
let sort = locs.docs.reduce((m, l) => Math.max(m, l.sortOrder), 0)
for (const l of fixture.settings.locations) {
  if (locs.docs.some((x) => x.name.toLowerCase() === l.name.toLowerCase())) continue
  await payload.create({ collection: 'comps-locations', data: { ...l, kind: l.kind as 'Subdivision' | 'Zone', sortOrder: ++sort }, ...opts })
}
const types = await payload.find({ collection: 'comps-property-types', pagination: false, ...opts })
sort = types.docs.reduce((m, t) => Math.max(m, t.sortOrder), 0)
for (const t of fixture.settings.types) {
  if (types.docs.some((x) => x.name.toLowerCase() === t.name.toLowerCase())) continue
  await payload.create({
    collection: 'comps-property-types',
    data: { ...t, form: t.form as 'lot' | 'house' | 'condo', category: t.category as 'Commercial', sortOrder: ++sort },
    ...opts,
  })
}

const locId = new Map((await payload.find({ collection: 'comps-locations', pagination: false, ...opts })).docs.map((l) => [l.name, l.id]))
const typeId = new Map((await payload.find({ collection: 'comps-property-types', pagination: false, ...opts })).docs.map((t) => [t.name, t.id]))

const today = new Date()
const SKIP = new Set(['ref', 'loc', 'type', 'dateSold', 'directToDatabase', 'covers', 'year'])
const ctx = { payload, user: admin }
let direct = 0
for (const d of fixture.deals as FixtureDeal[]) {
  const dateSold = resolveSeedDate(d.dateSold, today)
  const locationId = d.loc ? locId.get(d.loc) : undefined
  const typeIdOf = d.type ? typeId.get(d.type) : undefined
  if (d.loc && !locationId) throw new Error(`${d.ref}: no place named ${d.loc}`)
  if (d.type && !typeIdOf) throw new Error(`${d.ref}: no type named ${d.type}`)

  if (!d.directToDatabase) {
    // D.1 step 3: the same rules (§8.6.3) and record builder (§8.6.4) as POST /api/deals.
    const v = (k: string) => (d[k] ?? null) as never
    const input: DealInput = {
      locationId,
      typeId: typeIdOf,
      pin: `${d.lat}, ${d.lng}`,
      details: v('details'),
      area: v('area'),
      lotArea: v('lotArea'),
      frontage: v('frontage'),
      price: v('price'),
      date: dateSold,
      codeOrLink: (d.code ?? d.link ?? null) as string | null,
      note: v('note'),
      corner: !!d.corner,
      ridgeView: d.view === 'Ridge view',
      terrain: v('terrain'),
      cond: v('cond'),
      year: v('year'),
      floor: v('floor'),
      furn: v('furn'),
      beds: v('beds'),
      baths: v('baths'),
      parking: v('parking'),
      parkIncl: v('parkIncl'),
      storeys: v('storeys'),
      fin: v('fin'),
      asking: v('asking'),
      dom: v('dom'),
    }
    const out = await createDeal(ctx, input)
    if (isFail(out)) throw new Error(`${d.ref}: ${out.error} ${out.field ?? ''} ${out.message ?? ''}`)
    continue
  }

  // DB-direct (D.1 step 3): a code plus a different link, or names not in Settings.
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) if (!SKIP.has(k) && v !== null && v !== undefined) data[k] = v
  if (d.year !== undefined && d.year !== null) data.yearBuilt = d.year
  if (locationId) data.location = locationId
  if (typeIdOf) data.propertyType = typeIdOf
  data.dateSold = dateSold
  await payload.create({ collection: 'comps-deals', data: data as Omit<CompsDeal, 'id' | 'createdAt' | 'updatedAt'>, ...opts })
  direct++
}
console.log(`seed:sample: ${fixture.deals.length} deals loaded (${fixture.deals.length - direct} through the record builder, ${direct} direct).`)
process.exit(0)
