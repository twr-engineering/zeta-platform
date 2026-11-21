import { expect, test } from './fixtures'

import { uiUser, USERS } from './users'

// Login-form tests run one after another per project, each project with its own user.
test.describe.configure({ mode: 'serial' })

// E1: login, wrong password, lockout, logout (AUTH-001 to AUTH-005, AUTH-008).
test('a page without a session goes to login, then back to that page after logging in', async ({ page }, info) => {
  const me = uiUser(info.project.name)
  await page.goto('/market-rates')
  await expect(page).toHaveURL(/\/login\?next=%2Fmarket-rates$/)
  await page.getByLabel('Email').fill(me.email)
  await page.getByLabel('Password').fill(me.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/market-rates$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Market rates' })).toBeVisible()
})

test('login errors use the exact copy', async ({ page }, info) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.locator('.err[role=alert]')).toHaveText('Enter your email and password.')
  await page.getByLabel('Email').fill(uiUser(info.project.name).email)
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.locator('.err[role=alert]')).toHaveText('That email and password do not match.')
})

test('a CMS editor without Comps access cannot log in', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(USERS.editor.email)
  await page.getByLabel('Password').fill(USERS.editor.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.locator('.err[role=alert]')).toHaveText('That email and password do not match.')
})

test('after 5 failed tries the 6th is refused for 15 minutes (AUTH-004)', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'chromium-light', 'one shared lockout account: run once')
  for (let i = 0; i < 5; i++) {
    const res = await page.request.post('/api/auth/login', { headers: { origin: baseURL! }, data: { email: USERS.lock.email, password: 'wrong' } })
    expect(res.status()).toBe(401)
  }
  await page.goto('/login')
  await page.getByLabel('Email').fill(USERS.lock.email)
  await page.getByLabel('Password').fill(USERS.lock.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.locator('.err[role=alert]')).toHaveText('Too many tries. Wait 15 minutes and try again.')
})

test('signed in, /login goes to Closed deals; log out ends the session (AUTH-005)', async ({ page, context, baseURL }, info) => {
  const res = await context.request.post('/api/auth/login', { headers: { origin: baseURL! }, data: uiUser(info.project.name) })
  expect(res.status()).toBe(200)
  await page.goto('/login')
  await expect(page).toHaveURL(/\/deals$/)
  await page.goto('/market-rates')
  await page.getByRole('button', { name: 'Your account' }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)
  // Back must not show app data: the previous screen now sends the browser to login.
  await page.goBack()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0)
})

test('API routes without a session answer 401 unauthenticated (AUTH-001)', async ({ request }) => {
  const res = await request.get('/api/auth/me')
  expect(res.status()).toBe(401)
  expect(await res.json()).toEqual({ error: { code: 'unauthenticated' } })
})
