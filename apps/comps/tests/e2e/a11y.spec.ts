import AxeBuilder from '@axe-core/playwright'

import { expect, test, type Page } from './fixtures'

import { expectNoSidewaysScroll } from './helpers'
import { ADMIN_STATE, SIZES } from './users'

// Accessibility and responsive pass (app PRD §11, §12; E12, E13; A11Y-001..010; RSP-001..005;
// R13, R18). axe-core runs on every screen and every open dialog, in both themes.
test.use({ storageState: ADMIN_STATE })

const WIDE = { width: 1440, height: 900 }
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function axe(page: Page, what: string) {
  // Map tiles and Leaflet's own controls are third-party imagery; the maps are visual aids (§9.6).
  const res = await new AxeBuilder({ page }).withTags(TAGS).exclude('.leaflet-tile-pane').analyze()
  const found = res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`)
  expect(found, `${what}: axe violations`).toEqual([])
}
const ready = async (page: Page, url: string, sel: string) => {
  await page.goto(url)
  await expect(page.locator(sel).first()).toBeVisible()
}

test('axe: every screen and open dialog, in this theme (E13, A11Y-001, A11Y-006)', async ({ page }) => {
  test.skip(/webkit/.test(test.info().project.name), 'axe runs in Chromium, both themes')
  await page.setViewportSize(WIDE)
  await ready(page, '/deals', '.drow')
  await page.locator('.drow').first().click()
  await axe(page, 'Closed deals with details open')
  await page.locator('#fMore').click()
  await axe(page, 'Filters sheet')
  await page.keyboard.press('Escape')
  await page.locator('.ddetail').getByRole('button', { name: 'Delete' }).click()
  await axe(page, 'Confirm dialog')
  await page.keyboard.press('Escape')

  await ready(page, '/market-rates', '#summary tbody tr')
  await page.locator('#lowToggle').click()
  await axe(page, 'Market rates')

  await ready(page, '/cma', '#sArea')
  await page.locator('#sArea').fill('500')
  await page.locator('#sFront').fill('20')
  await page.locator('#rMore summary').click()
  await expect(page.locator('#near tbody tr').first()).toBeVisible()
  await axe(page, 'CMA')

  await ready(page, '/deals/new', '#aType')
  await page.locator('#aMore summary').click()
  await page.locator('#aSave').click()
  await expect(page.locator('.ferr')).toBeVisible()
  await axe(page, 'Add a deal with an error')
  await page.locator('#aLoc').selectOption('__new')
  await expect(page.getByRole('dialog')).toBeVisible()
  await axe(page, 'Place dialog from the add form')
  await page.keyboard.press('Escape')

  const deal = (await (await page.request.get('/api/deals')).json()).deals[0]
  await ready(page, `/deals/${deal.id}/edit`, '#aDelete')
  await axe(page, 'Edit a deal')

  await ready(page, '/settings', 'tbody tr')
  await axe(page, 'Settings: places')
  await page.getByRole('button', { name: 'More actions for Centrio' }).click()
  await axe(page, 'Settings row menu')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Property types/ }).click()
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await axe(page, 'Settings: types')
  await page.getByRole('button', { name: '+ Add property type' }).click()
  await axe(page, 'Type dialog')
})

test('axe: login', async ({ browser }) => {
  test.skip(/webkit/.test(test.info().project.name), 'axe runs in Chromium, both themes')
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, colorScheme: test.info().project.use.colorScheme, baseURL: test.info().project.use.baseURL })
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.locator('.err')).toBeVisible()
  await axe(page, 'Login with an error')
  await ctx.close()
})

// ---------- responsive (E12, RSP-001, RSP-002) ----------

const SCREENS: [string, string, string][] = [
  ['Closed deals', '/deals', '.drow'],
  ['Market rates', '/market-rates', '#summary tbody tr'],
  ['CMA', '/cma', '#sArea'],
  ['Add a deal', '/deals/new', '#aType'],
  ['Settings', '/settings', 'tbody tr'],
  ['Settings types', '/settings?tab=types', 'tbody tr'],
]

for (const [name, url, sel] of SCREENS) {
  test(`${name}: no sideways scroll at all six sizes (E12, RSP-001)`, async ({ page }) => {
    await ready(page, url, sel)
    for (const size of SIZES) {
      await page.setViewportSize(size)
      await page.waitForTimeout(150)
      await expectNoSidewaysScroll(page)
    }
  })
}

test('the header follows §11.2 at each width (RSP-002)', async ({ page }) => {
  await ready(page, '/deals', '.drow')
  const box = (s: string) => page.locator(s).boundingBox().then((b) => b!)
  await page.setViewportSize({ width: 390, height: 844 })
  const [logo, tabs, add] = [await box('.brand'), await box('.tabs'), await box('.topright')]
  expect(tabs.y).toBeGreaterThanOrEqual(logo.y + logo.height - 1) // tabs on their own row
  expect(Math.abs(add.y - logo.y)).toBeLessThan(20) // actions on the logo's row
  expect(tabs.width).toBeGreaterThan(390 - 2 * 16 - 4) // full width
  for (const width of [820, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const [l, t] = [await box('.brand'), await box('.tabs')]
    expect(Math.abs(t.y + t.height / 2 - (l.y + l.height / 2)), `one row at ${width}`).toBeLessThan(12)
  }
})

// ---------- structure, focus, keyboard, motion (A11Y-002..005, A11Y-010) ----------

test('exactly one h1 on every route (A11Y-003)', async ({ page }) => {
  const deal = (await (await page.request.get('/api/deals')).json()).deals[0]
  for (const [url, sel] of [...SCREENS.map(([, u, s]) => [u, s] as const), [`/deals/${deal.id}/edit`, '#aDelete'] as const]) {
    await ready(page, url, sel)
    await expect(page.locator('h1'), url).toHaveCount(1)
  }
})

test('keyboard focus always shows the 2 px ring (A11Y-002)', async ({ page }) => {
  test.skip(/webkit/.test(test.info().project.name), 'WebKit skips links when tabbing by default')
  for (const [, url, sel] of SCREENS.slice(0, 4)) {
    await ready(page, url, sel)
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab')
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return 'none'
        const cs = getComputedStyle(el)
        // Chips show the ring on their label; the dual slider thumbs and maps use their own ring.
        const label = el.closest('label.tag') as HTMLElement | null
        const own = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2
        const lab = !!label && getComputedStyle(label).outlineStyle !== 'none'
        const thumb = el.matches('.dual input')
        return own || lab || thumb ? 'ok' : `${el.tagName.toLowerCase()}#${el.id}.${el.className}`
      })
      expect(ring, `${url}, Tab ${i + 1}`).not.toMatch(/^(?!ok|none)/)
    }
  }
})

test('keyboard: rows open with Space, menus and tooltips close with Escape, segmented controls use arrows (A11Y-004)', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await ready(page, '/deals', '.drow')
  await page.locator('.drow').first().focus()
  await page.keyboard.press(' ')
  await expect(page.locator('.drow').first()).toHaveAttribute('aria-expanded', 'true')
  // Account menu.
  await page.getByRole('button', { name: 'Your account' }).click()
  await expect(page.locator('#acctMenu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#acctMenu')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Your account' })).toBeFocused()
  // Market rates: Space selects a row; the trend grouping is one Tab stop with arrows.
  await ready(page, '/market-rates', '#summary tbody tr')
  // Tooltip: focus shows it, Escape hides it and keeps focus on the button.
  const info = page.locator('#summary thead .info').first()
  await info.focus()
  await expect(page.locator('[role="tooltip"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[role="tooltip"]')).toBeHidden()
  await expect(info).toBeFocused()
  const second = page.locator('#summary tbody tr[data-key]').nth(1)
  await second.focus()
  await page.keyboard.press(' ')
  await expect(second).toHaveClass(/sel/)
  const quarter = page.locator('[data-tp="q"]')
  await expect(quarter).toHaveAttribute('tabindex', '0')
  await expect(page.locator('[data-tp="h"]')).toHaveAttribute('tabindex', '-1')
  await quarter.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-tp="h"]')).toBeFocused()
  await expect(page.locator('[data-tp="h"]')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(quarter).toHaveAttribute('aria-checked', 'true')
  // Filters sheet choices: arrows move and pick; Space on the picked one clears it.
  await page.locator('#fType').selectOption({ label: 'Condo unit' })
  await page.locator('#fMore').click()
  const studio = page.locator('[data-fk="cbeds"][data-v="0"]')
  await studio.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-fk="cbeds"][data-v="1"]')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press(' ')
  await expect(page.locator('[data-fk="cbeds"][aria-checked="true"]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('#fMore')).toBeFocused() // A11Y-005
})

test('reduced motion: no transitions, skeletons do not pulse (A11Y-010)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/bootstrap', async (r) => {
    await held
    await r.continue()
  })
  await page.goto('/deals', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.listcol .skel').first()).toBeVisible()
  expect(await page.locator('.listcol .skel').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  release()
  await expect(page.locator('.drow').first()).toBeVisible()
  for (const sel of ['.drow', '.btn', '.tab'])
    expect(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).transitionDuration), sel).toMatch(/^0s(, 0s)*$/)
})

// ---------- touch targets (R13, RSP-004) ----------

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  /** Every visible interactive element's hit box (its own box, or its ::before hit area) is ≥ 44×44. */
  async function smallTargets(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [tabindex="0"]'
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if ((el as HTMLButtonElement).disabled || el.closest('[hidden], [aria-hidden="true"], .srl, dialog:not([open])')) continue
        const r = el.getBoundingClientRect()
        if (r.width <= 1 || r.height <= 1) continue
        let w = r.width
        let h = r.height
        // Checkboxes and radios count by their label row.
        if (el.matches('input[type=checkbox], input[type=radio]')) {
          const l = el.closest('label')
          if (l) {
            const lr = l.getBoundingClientRect()
            w = Math.max(w, lr.width)
            h = Math.max(h, lr.height)
          }
        }
        const b = getComputedStyle(el, '::before')
        if (b.content !== 'none' && b.position === 'absolute') {
          const px = (v: string) => (v.endsWith('px') ? parseFloat(v) : NaN)
          const bw = px(b.width)
          const bh = px(b.height)
          w = Math.max(w, Number.isNaN(bw) ? r.width - (px(b.left) || 0) - (px(b.right) || 0) : bw)
          h = Math.max(h, Number.isNaN(bh) ? r.height - (px(b.top) || 0) - (px(b.bottom) || 0) : bh)
        }
        if (w < 43.5 || h < 43.5) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(w)}×${Math.round(h)}`)
      }
      return out
    })
  }

  test('every tap target is at least 44×44 on every screen (R13, RSP-004)', async ({ page }) => {
    test.skip(!/chromium-light/.test(test.info().project.name), 'touch emulation: once')
    await ready(page, '/deals', '.drow')
    await page.locator('.drow').first().click()
    expect(await smallTargets(page), 'Closed deals').toEqual([])
    await page.locator('#fMore').click()
    expect(await smallTargets(page), 'Filters sheet').toEqual([])
    await page.locator('#fDone').click()
    await ready(page, '/market-rates', '#summary tbody tr')
    expect(await smallTargets(page), 'Market rates').toEqual([])
    await ready(page, '/cma', '#sArea')
    await page.locator('#sArea').fill('500')
    await page.locator('#rMore summary').click()
    expect(await smallTargets(page), 'CMA').toEqual([])
    await ready(page, '/deals/new', '#aType')
    await page.locator('#aMore summary').click()
    expect(await smallTargets(page), 'Add a deal').toEqual([])
    await ready(page, '/settings', 'tbody tr')
    await page.locator('.kebab').first().click()
    expect(await smallTargets(page), 'Settings').toEqual([])
  })
})
