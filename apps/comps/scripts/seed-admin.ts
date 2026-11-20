/**
 * npm run seed:admin (app PRD AUTH-002). Creates the one Comps admin from ADMIN_EMAIL,
 * ADMIN_PASSWORD and ADMIN_NAME (default "Jong"). Runs in every environment and is safe to
 * repeat: if that email already exists, or any comps-admin exists, nothing changes.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD
const name = process.env.ADMIN_NAME?.trim() || 'Jong'

if (!email || !password) {
  console.error('seed:admin needs ADMIN_EMAIL and ADMIN_PASSWORD.')
  process.exit(1)
}

const payload = await getPayload({ config })
const existing = await payload.find({
  collection: 'users',
  where: { or: [{ email: { equals: email } }, { roles: { contains: 'comps-admin' } }] },
  limit: 1,
  overrideAccess: true,
})
if (existing.totalDocs > 0) {
  console.log('seed:admin: an admin already exists, nothing changed.')
} else {
  await payload.create({ collection: 'users', data: { email, password, name, roles: ['comps-admin'] }, overrideAccess: true })
  console.log(`seed:admin: created ${name} <${email}>.`)
}
process.exit(0)
