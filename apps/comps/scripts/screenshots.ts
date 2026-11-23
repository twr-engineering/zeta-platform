/**
 * E14 (app PRD §17.2): screenshots of every screen at the six test sizes, light and dark, stored as
 * the visual baseline for review against the reference build. Read-only: it signs in and looks.
 * Usage: SHOTS_URL=https://… SHOTS_EMAIL=… SHOTS_PASSWORD=… [SHOTS_DIR=…] pnpm screenshots
 * Writes PNGs to SHOTS_DIR (default ../../.local/screenshots/<Manila date>), named
 * <screen>-<width>x<height>-<theme>.png, plus index.html, a contact sheet to review them in.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium, type Page } from '@playwright/test'

const URL0 = (process.env.SHOTS_URL ?? 'http://localhost:3913').replace(/\/$/, '')
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
const DIR = path.resolve(process.env.SHOTS_DIR ?? path.join(process.cwd(), '../../.local/screenshots', today))
mkdirSync(DIR, { recursive: true })

const SIZES = [
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [820, 1180],
  [768, 1024],
  [390, 844],
] as const
const THEMES = ['light', 'dark'] as const

type Screen = { name: string; url: string; ready: string; then?: (p: Page) => Promise<void>; auth?: false }
const SCREENS: Screen[] = [
  { name: 'login', url: '/login', ready: 'button[type=submit]', auth: false },
  { name: 'deals', url: '/deals', ready: '.drow' },
  { name: 'deal-details', url: '/deals', ready: '.drow', then: async (p) => void (await p.locator('.drow').first().click()) },
  { name: 'market-rates', url: '/market-rates', ready: '#summary tbody tr' },
  { name: 'cma', url: '/cma', ready: '#sArea', then: async (p) => void (await p.locator('#sArea').fill('500')) },
  { name: 'add-deal', url: '/deals/new', ready: '#aType' },
  { name: 'settings', url: '/settings', ready: 'tbody tr' },
]

const browser = await chromium.launch()
const shots: { file: string; screen: string; size: string; theme: string }[] = []
for (const theme of THEMES) {
  const ctx = await browser.newContext({ baseURL: URL0, colorScheme: theme })
  const login = await ctx.request.post('/api/auth/login', {
    data: { email: process.env.SHOTS_EMAIL, password: process.env.SHOTS_PASSWORD },
    headers: { origin: URL0 },
  })
  if (!login.ok()) throw new Error(`login failed: ${login.status()}`)
  const anon = await browser.newContext({ baseURL: URL0, colorScheme: theme })
  for (const s of SCREENS) {
    const page = await (s.auth === false ? anon : ctx).newPage()
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto(s.url)
      await page.locator(s.ready).first().waitFor()
      if (s.then) await s.then(page)
      // Let map tiles, fonts and the deferred map render settle.
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(600)
      const file = `${s.name}-${w}x${h}-${theme}.png`
      await page.screenshot({ path: path.join(DIR, file), fullPage: true })
      shots.push({ file, screen: s.name, size: `${w}×${h}`, theme })
    }
    await page.close()
  }
  await ctx.close()
  await anon.close()
}
await browser.close()

const rows = SCREENS.map(
  (s) =>
    `<h2>${s.name}</h2><div class="row">` +
    shots
      .filter((x) => x.screen === s.name)
      .map((x) => `<figure><a href="${x.file}"><img loading="lazy" src="${x.file}" alt=""></a><figcaption>${x.size} · ${x.theme}</figcaption></figure>`)
      .join('') +
    '</div>',
).join('\n')
writeFileSync(
  path.join(DIR, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Zeta Comps screenshots ${today}</title>
<style>body{font:14px system-ui;margin:16px}.row{display:flex;gap:12px;overflow-x:auto}figure{margin:0}img{height:260px;border:1px solid #ccc}figcaption{color:#555}</style>
<h1>Zeta Comps: E14 baseline, ${today}</h1><p>${URL0}</p>${rows}`,
)
console.log(JSON.stringify({ dir: DIR, count: shots.length }))
