import { expect, test as setup } from '@playwright/test'

import { ADMIN_STATE, USERS } from './users'

// Sign the shared admin in once; screen tests reuse this cookie instead of each logging in.
setup('sign in the admin', async ({ request, baseURL }) => {
  const res = await request.post('/api/auth/login', { headers: { origin: baseURL! }, data: USERS.admin })
  expect(res.status()).toBe(200)
  await request.storageState({ path: ADMIN_STATE })
})
