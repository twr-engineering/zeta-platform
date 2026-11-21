import { expect, test } from './fixtures'

import { expectNoSidewaysScroll } from './helpers'
import { ADMIN_STATE, SIZES } from './users'

const ROUTES = [
  { path: '/deals', h1: 'Closed deals' },
  { path: '/market-rates', h1: 'Market rates' },
  { path: '/cma', h1: 'Comparative Market Analysis' },
  { path: '/deals/new', h1: 'Add a closed deal' },
  { path: '/settings', h1: 'Settings' },
]

test('login works at every size, with the logo for the theme and no sideways scroll (AUTH-008)', async ({ page, colorScheme }) => {
  for (const size of SIZES) {
    await page.setViewportSize(size)
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible()
    await expectNoSidewaysScroll(page)
    const shown = colorScheme === 'dark' ? '.logo-dark' : '.logo-light'
    const hidden = colorScheme === 'dark' ? '.logo-light' : '.logo-dark'
    await expect(page.locator(`.logincard ${shown}`)).toBeVisible()
    await expect(page.locator(`.logincard ${hidden}`)).toBeHidden()
  }
})

test.describe('signed in', () => {
  test.use({ storageState: ADMIN_STATE })

  test('every screen renders with the header, one h1 and no sideways scroll at every size (A11Y-003)', async ({ page }) => {
    for (const size of SIZES) {
      await page.setViewportSize(size)
      for (const r of ROUTES) {
        await page.goto(r.path)
        await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
        await expect(page.locator('h1')).toHaveCount(1)
        await expect(page.locator('h1')).toContainText(r.h1)
        await expectNoSidewaysScroll(page)
      }
    }
  })

  test('the current tab is marked, and "+ Add a deal" hides on the add route', async ({ page }) => {
    await page.goto('/market-rates')
    await expect(page.getByRole('link', { name: 'Market rates' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: '+ Add a deal' })).toBeVisible()
    await page.goto('/deals/new')
    await expect(page.getByRole('link', { name: '+ Add a deal' })).toHaveCount(0)
  })

  test('header layout per width (RSP-002, §11.2)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/deals')
    const brand = (await page.locator('.brand').boundingBox())!
    const tabs = (await page.locator('nav.tabs').boundingBox())!
    expect(tabs.y).toBeGreaterThanOrEqual(brand.y + brand.height - 1) // tabs on their own row
    expect(tabs.width).toBeGreaterThan(390 - 2 * 16 - 2) // full width
    await page.setViewportSize({ width: 1440, height: 900 })
    const brand2 = (await page.locator('.brand').boundingBox())!
    const tabs2 = (await page.locator('nav.tabs').boundingBox())!
    expect(Math.abs(tabs2.y + tabs2.height / 2 - (brand2.y + brand2.height / 2))).toBeLessThan(8) // one row
  })

  test('account menu opens, shows the name and role, closes on Escape', async ({ page }) => {
    await page.goto('/deals')
    const btn = page.getByRole('button', { name: 'Your account' })
    await btn.click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('Jong')
    await expect(menu).toContainText('Owner')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(btn).toBeFocused()
  })

  test('keyboard focus shows the 2 px ring (A11Y-002)', async ({ page }, info) => {
    test.skip(info.project.name.startsWith('webkit'), 'WebKit does not Tab to links by default')
    await page.goto('/deals')
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as Element)
      return { style: s.outlineStyle, width: s.outlineWidth }
    })
    expect(outline).toEqual({ style: 'solid', width: '2px' })
  })
})
