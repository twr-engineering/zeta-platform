import { expect, type Page } from '@playwright/test'

/** No sideways scroll (RSP-001 / AUTH-008). */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}
