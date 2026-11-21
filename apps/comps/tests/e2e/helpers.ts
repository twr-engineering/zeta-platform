import { expect, type Page } from './fixtures'

/** No sideways scroll (RSP-001 / AUTH-008). On failure, names what sticks out past the window. */
export async function expectNoSidewaysScroll(page: Page) {
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth
    const over = document.documentElement.scrollWidth - W
    const culprits = over > 0
      ? Array.from(document.querySelectorAll('body *'))
          .filter((e) => e.getBoundingClientRect().right > W + 0.5)
          .slice(0, 8)
          .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]} right=${Math.round(e.getBoundingClientRect().right)}`)
      : []
    return { over, W, culprits }
  })
  expect(r.over, `sideways scroll at ${r.W} px: ${r.culprits.join(' | ')}`).toBeLessThanOrEqual(0)
}
