/**
 * Test users for the Playwright suite (development and CI databases only, never production).
 * Idempotent: creates or resets them, unlocks the lockout user and clears its failed tries.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

if (process.env.APP_ENV === 'production' || !process.env.APP_ENV) {
  console.error('e2e-seed refuses to run without APP_ENV, or with APP_ENV=production.')
  process.exit(1)
}

export const E2E_USERS = {
  admin: { email: 'e2e-jong@example.test', password: 'e2e-password-123', name: 'Jong', roles: ['comps-admin'] },
  lock: { email: 'e2e-lock@example.test', password: 'e2e-password-123', name: 'Lock Test', roles: ['comps-admin'] },
  editor: { email: 'e2e-editor@example.test', password: 'e2e-password-123', name: 'CMS Editor', roles: ['editor'] },
  // One per browser project for the login-form tests: Payload keeps a user's sessions in one
  // list, so parallel logins as the same user can overwrite each other's session.
  ...Object.fromEntries(
    ['chromium-light', 'chromium-dark', 'webkit-light', 'webkit-dark'].map((p) => [
      `ui-${p}`,
      { email: `e2e-ui-${p}@example.test`, password: 'e2e-password-123', name: 'Jong', roles: ['comps-admin'] },
    ]),
  ),
} as const

const payload = await getPayload({ config })
for (const u of Object.values(E2E_USERS)) {
  const found = await payload.find({ collection: 'users', where: { email: { equals: u.email } }, limit: 1, overrideAccess: true })
  const data = { name: u.name, password: u.password, roles: [...u.roles], loginAttempts: 0, lockUntil: null }
  if (found.docs[0]) await payload.update({ collection: 'users', id: found.docs[0].id, data, overrideAccess: true })
  else await payload.create({ collection: 'users', data: { email: u.email, ...data }, overrideAccess: true })
}
console.log('e2e users ready')
process.exit(0)
