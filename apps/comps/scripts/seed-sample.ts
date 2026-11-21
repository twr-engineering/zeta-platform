/**
 * npm run seed:sample (app PRD Appendix D, NFR-008): development and staging only.
 * 1. Makes sure the default Settings lists exist (§13.5), then adds the 4 test entries (D.2).
 * 2. Deletes every deal (trashed ones too), then inserts the 75 fixture deals with dates
 *    resolved relative to today in Asia/Manila (D.3).
 * Stamps are the admin (the comps-admin from seed:admin, or the first one found).
 * `--reset` also deletes every Settings row first, so the lists are exactly the defaults plus
 * D.2 (the test suites use it; without it, Settings edits made in the app are kept).
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import type { CompsDeal } from '@zeta/cms-config/types'

import fixture from './fixtures/sample-deals.json' with { type: 'json' }
import { ensureDefaultSettings } from '../src/lib/data'
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
for (const d of fixture.deals as FixtureDeal[]) {
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) if (!SKIP.has(k) && v !== null && v !== undefined) data[k] = v
  if (d.year !== undefined && d.year !== null) data.yearBuilt = d.year
  if (d.loc) {
    const id = locId.get(d.loc)
    if (!id) throw new Error(`${d.ref}: no place named ${d.loc}`)
    data.location = id
  }
  if (d.type) {
    const id = typeId.get(d.type)
    if (!id) throw new Error(`${d.ref}: no type named ${d.type}`)
    data.propertyType = id
  }
  data.dateSold = resolveSeedDate(d.dateSold, today)
  // The record builder (§8.6.4) arrives with the deal API in M3; the fixture is already in
  // stored form, and the database checks still guard every row.
  await payload.create({ collection: 'comps-deals', data: data as Omit<CompsDeal, 'id' | 'createdAt' | 'updatedAt'>, ...opts })
}
console.log(`seed:sample: ${fixture.deals.length} deals loaded.`)
process.exit(0)
