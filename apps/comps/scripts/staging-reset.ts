/**
 * npm run staging:reset — after a staging QA run on a database that will go live (M9, PRD C5:
 * production starts empty). Deletes the e2e test users (`@example.test`), the staging admin
 * (STAGING_ADMIN_EMAIL, if set), every deal (trash included) and the Settings lists, then
 * re-inserts the default lists only if a real admin remains. Real users are never touched.
 * Needs --yes. Refuses APP_ENV=production or an unset APP_ENV, like the other seed scripts.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { ensureDefaultSettings } from '../src/lib/data'

if (process.env.APP_ENV === 'production' || !process.env.APP_ENV) {
  console.error('staging:reset refuses to run without APP_ENV, or with APP_ENV=production.')
  process.exit(1)
}
if (!process.argv.includes('--yes')) {
  console.error('staging:reset deletes every deal and the test users. Run it again with --yes.')
  process.exit(1)
}

const payload = await getPayload({ config })
const opts = { overrideAccess: true } as const
const staging = process.env.STAGING_ADMIN_EMAIL?.trim().toLowerCase()

const deals = await payload.delete({ collection: 'comps-deals', where: { id: { exists: true } }, trash: true, ...opts })
await payload.delete({ collection: 'comps-locations', where: { id: { exists: true } }, ...opts })
await payload.delete({ collection: 'comps-property-types', where: { id: { exists: true } }, ...opts })
const users = await payload.delete({
  collection: 'users',
  where: { or: [{ email: { like: '@example.test' } }, ...(staging ? [{ email: { equals: staging } }] : [])] },
  ...opts,
})
const admin = (await payload.find({ collection: 'users', where: { roles: { contains: 'comps-admin' } }, limit: 1, ...opts })).docs[0]
const added = admin ? await ensureDefaultSettings(payload, admin) : { locations: 0, types: 0 }
console.log(
  `staging:reset: ${deals.docs.length} deals and ${users.docs.length} test users deleted; ` +
    (admin ? `default Settings re-added (${added.locations} places, ${added.types} types).` : 'no admin left, so no Settings (seed:admin adds them).'),
)
process.exit(0)
