/**
 * NFR-002 measurement: with Chrome's CPU slowed 4× (a mid-range phone), how long a filter, search
 * or sort change takes to reach the next paint on Closed deals. Needs the app running against a
 * database with the deals to test (see seed:scale) and a user. Read-only.
 * Usage: PERF_URL=http://localhost:3923 PERF_EMAIL=... PERF_PASSWORD=... pnpm perf:filters
 */
import { chromium } from '@playwright/test'

const URL0 = process.env.PERF_URL ?? 'http://localhost:3923'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: URL0 })
const page = await ctx.newPage()
// Map tiles are not what is being measured: serve nothing for them.
await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 204 }))

const login = await page.request.post('/api/auth/login', {
  data: { email: process.env.PERF_EMAIL, password: process.env.PERF_PASSWORD },
  headers: { origin: URL0 },
})
if (!login.ok()) throw new Error(`login failed: ${login.status()}`)
await page.goto('/deals')
await page.locator('.drow').first().waitFor()
const count = await page.locator('#listCount').textContent()

const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

/**
 * NFR-002 "next paint": from the input event until the first frame after the list's content updates
 * (a MutationObserver on the list column, then requestAnimationFrame). The map catches up in a
 * deferred render after that; it is reported separately as `mapMs` (the marker count settling).
 */
async function timed(label: string, act: () => Promise<void>, watch = '.listcol') {
  await page.evaluate((watch) => {
    const w = window as unknown as { __t: number; __paint: Promise<number>; __map: Promise<number> }
    // From the input event itself (as INP measures), not from when Playwright starts acting: its
    // click first waits for the element to be stable, which is not the app's time.
    w.__t = Infinity
    for (const type of ['pointerdown', 'click', 'input', 'change'])
      document.addEventListener(type, (e) => void (w.__t = Math.min(w.__t, e.timeStamp)), { capture: true, once: true })
    w.__paint = new Promise((resolve) => {
      const target = document.querySelector(watch)!
      const mo = new MutationObserver(() => {
        mo.disconnect()
        requestAnimationFrame(() => resolve(performance.now() - w.__t))
      })
      mo.observe(target, { subtree: true, childList: true, characterData: true, attributes: true })
    })
    const map = document.getElementById('dealMap')!
    const before = map.getAttribute('data-markers')
    w.__map = new Promise((resolve) => {
      const mo = new MutationObserver(() => {
        if (map.getAttribute('data-markers') !== before) {
          mo.disconnect()
          requestAnimationFrame(() => resolve(performance.now() - w.__t))
        }
      })
      mo.observe(map, { attributes: true, attributeFilter: ['data-markers'] })
      setTimeout(() => resolve(NaN), 5000)
    })
  }, watch)
  await act()
  const [ms, mapMs] = await page.evaluate(async () => {
    const w = window as unknown as { __paint: Promise<number>; __map: Promise<number> }
    return [await w.__paint, await w.__map]
  })
  return { label, ms: Math.round(ms), mapMs: Number.isNaN(mapMs) ? null : Math.round(mapMs) }
}

const results = [
  await timed('type filter', () => page.locator('#fType').selectOption({ index: 1 }).then(() => undefined)),
  await timed('period filter', () => page.locator('#fPeriod').selectOption('9999').then(() => undefined)),
  await timed('location filter', () => page.locator('#fLoc').selectOption({ index: 1 }).then(() => undefined)),
  await timed('clear filters', () => page.getByRole('button', { name: 'Clear filters' }).click()),
  await timed('sort by price per sqm', () => page.locator('#sortBy').selectOption('pp:desc').then(() => undefined)),
]
// Search runs 120 ms after the last key (debounce, §7.1.3): the measure includes that wait.
// The search box sits inside the list column, so watch the count line, which changes only on results.
results.push(await timed('search (incl. 120 ms debounce)', () => page.locator('#dSearch').fill('S1'), '#listCount'))

// NFR-002: under 100 ms to the next paint. The search's 120 ms debounce is the spec's (§7.1.3), not work.
const DEBOUNCE = 120
const worst = Math.max(...results.map((r) => r.ms - (r.label.startsWith('search') ? DEBOUNCE : 0)))
console.log(JSON.stringify({ list: count?.trim(), cpu: '4x slower', results, worstMs: worst, pass: worst < 100 }))
await browser.close()
