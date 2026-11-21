import { expect, test } from './fixtures'

import { ADMIN_STATE } from './users'

test.use({ storageState: ADMIN_STATE })

// Appendix B tips open on hover, click and focus (M1 done-when; behaviour §6.5).
test('the CMA tip opens on hover, pins on click, opens on focus and closes on Escape', async ({ page }) => {
  await page.goto('/cma')
  const btn = page.getByRole('button', { name: 'About comparative market analysis (cma)' })
  const tip = page.getByRole('tooltip')

  await btn.hover()
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('Comparative Market Analysis (CMA)')
  await expect(btn).toHaveAttribute('aria-expanded', 'true')
  await page.mouse.move(5, 5)
  await expect(tip).toBeHidden()

  await btn.click()
  await page.mouse.move(5, 5)
  await expect(tip).toBeVisible() // pinned
  await page.locator('h1').click({ position: { x: 2, y: 2 } })
  await expect(tip).toBeHidden() // a click elsewhere closes it

  await btn.focus()
  await expect(tip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
  await expect(btn).toBeFocused()
})
