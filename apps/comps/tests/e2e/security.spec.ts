import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from './fixtures'

import { ADMIN_STATE } from './users'

// Security (app PRD NFR-009, NFR-010): response headers, no CSP violations on any screen, and no
// server secret in the built client files.
test.use({ storageState: ADMIN_STATE })

/** Record CSP violations in the page, from the first script on. */
async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] }
    w.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)

test('every response carries the security headers (NFR-010)', async ({ page }) => {
  const res = await page.goto('/deals')
  const h = res!.headers()
  expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['content-security-policy']).toContain('https://tile.openstreetmap.org')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['strict-transport-security']).toMatch(/^max-age=\d+/)
  expect(h['x-powered-by']).toBeUndefined()
  // A fresh nonce on every request.
  const again = (await page.goto('/deals'))!.headers()['content-security-policy']
  expect(again).not.toBe(h['content-security-policy'])
  // The API answers carry the fixed headers too.
  const api = await page.request.get('/api/bootstrap')
  expect(api.headers()['x-content-type-options']).toBe('nosniff')
})

test('no screen triggers a CSP violation (NFR-010)', async ({ page }) => {
  await watchCsp(page)
  const screens: [string, string][] = [
    ['/deals', '.drow'],
    ['/market-rates', '#summary tbody tr'],
    ['/cma', '#sArea'],
    ['/deals/new', '#aType'],
    ['/settings', 'tbody tr'],
  ]
  for (const [url, sel] of screens) {
    await page.goto(url)
    await expect(page.locator(sel).first()).toBeVisible()
    if (url === '/deals') await page.locator('.drow').first().click() // details, tooltip, map selection
    if (url === '/cma') await page.locator('#sArea').fill('500')
    await page.waitForTimeout(300)
    expect(await violations(page), url).toEqual([])
  }
})

test('the login page works under the CSP', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: test.info().project.use.baseURL })
  const page = await ctx.newPage()
  await watchCsp(page)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.locator('.err')).toBeVisible() // client script ran: validation message shown
  expect(await violations(page)).toEqual([])
  await ctx.close()
})

test('no server secret in the built client files (NFR-009)', () => {
  test.skip(test.info().project.name !== 'chromium-light', 'file scan: once')
  test.skip(!!process.env.E2E_BASE_URL, 'scans the local build; staging runs the same code')
  const dir = path.resolve(process.cwd(), '.next/static') // Playwright runs from apps/comps
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|css|html|json)$/.test(f)) files.push(p)
    }
  }
  walk(dir)
  expect(files.length).toBeGreaterThan(0)
  const secrets = [process.env.PAYLOAD_SECRET, process.env.DATABASE_URI].filter((s): s is string => !!s && s.length > 8)
  expect(secrets.length).toBeGreaterThan(0)
  for (const f of files) {
    const body = readFileSync(f, 'utf8')
    for (const s of secrets) expect(body.includes(s), `${path.basename(f)} holds a server secret`).toBe(false)
    expect(/postgres(ql)?:\/\/[^\s'"]*@/.test(body), `${path.basename(f)} holds a database URL`).toBe(false)
  }
})

test('the nightly purge route is closed without the cron secret (C10)', async ({ request }) => {
  test.skip(test.info().project.name !== 'chromium-light', 'API check: once')
  const none = await request.get('/api/cron/purge', { headers: { cookie: '' } })
  expect(none.status()).toBe(401)
  const wrong = await request.get('/api/cron/purge', { headers: { authorization: 'Bearer not-the-secret' } })
  expect(wrong.status()).toBe(401)
})
