import { expect, test, type Page } from './fixtures'

import { expectNoSidewaysScroll } from './helpers'
import { ADMIN_STATE } from './users'

// Market rates (app PRD §7.2, MR-001..010) on the Appendix D set; values from D.5.
// Regressions R1 (trend uses the row's filtered deals), R2 (See the deals), R6, R14.
test.use({ storageState: ADMIN_STATE })

type Deal = { date: string; beds: number | null; location: { name: string }; type: { name: string } }
const WIDE = { width: 1440, height: 900 }
const row = (page: Page, loc: string, type: string) =>
  page.locator('#summary tbody tr[data-key]').filter({ has: page.locator('.c-loc strong', { hasText: new RegExp(`^${loc}$`) }) }).filter({ has: page.locator('.c-type', { hasText: new RegExp(`^${type}`) }) })

async function open(page: Page, size = WIDE) {
  await page.setViewportSize(size)
  await page.goto('/market-rates')
  await expect(page.locator('#summary tbody tr[data-key]').first()).toBeVisible()
}

test('rows, values and order; the first ready row is selected and named in the trend (MR-001, MR-003, MR-004, R6)', async ({ page }) => {
  await open(page)
  const ready = page.locator('#summary tbody tr[data-key]:not(.low)')
  await expect(ready.locator('.c-loc strong')).toHaveText(['Centrio', 'Gran Europa', 'Pueblo de Oro', 'Xavier Estates', 'Xavier Estates', 'Uptown main road, north stretch'])
  await expect(ready.locator('.c-mid strong')).toHaveText(['₱130,500', '₱46,000', '₱25,500', '₱75,000', '₱37,252', '₱54,000'])
  await expect(ready.locator('.c-rng')).toHaveText([/₱127,250 to ₱137,000/, /₱38,000 to ₱55,000/, /₱25,393 to ₱25,600/, /₱69,000 to ₱83,000/, /₱36,872 to ₱37,646/, /₱54,000 to ₱54,750/])
  await expect(ready.locator('.c-conf')).toHaveText(['Medium confidence', 'Low confidence', 'Medium confidence', 'Medium confidence', 'High confidence', 'Low confidence'])
  await expect(ready.nth(5).locator('.pill').first()).toHaveText('Area')
  const first = ready.first()
  await expect(first).toHaveClass(/sel/)
  const bg = await first.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe(/dark/.test(test.info().project.name) ? 'rgb(46, 42, 14)' : 'rgb(255, 250, 205)')
  await expect(page.locator('#trendTitle')).toHaveText('Centrio, Condo unit')
  await expectNoSidewaysScroll(page)
})

test('dark mode: selected and hovered rows differ (MR-009, R6)', async ({ page }) => {
  test.skip(!/dark/.test(test.info().project.name), 'dark projects only')
  await open(page)
  const hov = row(page, 'Gran Europa', 'Commercial lot')
  await hov.hover()
  const hovered = await hov.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const selected = await page.locator('#summary tr.sel td').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(hovered).toBe('rgb(51, 51, 51)')
  expect(selected).toBe('rgb(46, 42, 14)')
})

test('waiting rows sit behind the toggle and never show a price (MR-002)', async ({ page }) => {
  await open(page)
  const toggle = page.locator('#lowToggle')
  await expect(toggle).toHaveText('Show 12 rows with fewer than 5 deals')
  await expect(page.locator('#summary tr.low')).toHaveCount(0)
  await toggle.click()
  await expect(toggle).toHaveText('Hide 12 rows with fewer than 5 deals')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toBeFocused()
  const south = row(page, 'Uptown main road, south stretch', 'Commercial lot')
  await expect(south.locator('.c-note')).toHaveText('4 of 5 deals needed')
  await expect(page.locator('#summary tr.low .c-mid')).toHaveCount(0)
  // Selecting a waiting row: "Not enough deals yet", and the toggle is forced open.
  await south.click()
  await expect(page.locator('#trendTitle')).toHaveText('Uptown main road, south stretch, Commercial lot')
  await expect(page.locator('#trend .empty')).toContainText('Not enough deals yet')
  await expect(page.locator('#trend .empty')).toContainText('A trend needs at least 5 closed deals. This row has 4.')
  await toggle.press('Enter')
  await expect(toggle).toHaveText('Hide 12 rows with fewer than 5 deals')
  // Keyboard selection.
  await row(page, 'Pueblo de Oro', 'Residential lot').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#trendTitle')).toHaveText('Pueblo de Oro, Residential lot')
  await toggle.press('Enter')
  await expect(toggle).toHaveText('Show 12 rows with fewer than 5 deals')
})

test('the trend: points, gap lines, grouping, "not enough" states (MR-005, MR-006)', async ({ page }) => {
  await open(page)
  await row(page, 'Xavier Estates', 'Residential lot').click()
  const svg = page.locator('#trend svg')
  await expect(svg).toHaveAttribute('aria-label', 'Middle price per sqm by quarter')
  await expect(svg.locator('circle')).toHaveCount(5)
  await expect(svg.locator('.gapline')).toHaveCount(1) // Q−5 and Q−3 are gaps
  await expect(page.locator('#trend .hint')).toHaveText('Each point is the middle price of the deals sold that quarter. Quarters with fewer than 2 deals are left out.')
  await expect(page.locator('#trendFoot')).toContainText('Based on 16 closed deals. If one looks wrong, open it to edit or delete it.')
  await page.locator('[data-tp="y"]').click()
  await expect(svg).toHaveAttribute('aria-label', 'Middle price per sqm by year')
  await expect(page.locator('[data-tp="y"]')).toHaveAttribute('aria-checked', 'true')
  await row(page, 'Centrio', 'Condo unit').click()
  await expect(page.locator('#trend .empty')).toContainText('Not enough for a trend yet')
  await expect(page.locator('#trend .empty')).not.toContainText('Try a longer period.')
  await page.locator('[data-tp="h"]').click()
  await expect(page.locator('#trend svg circle')).toHaveCount(2)
  await page.locator('[data-tp="q"]').click()
  await row(page, 'Gran Europa', 'Commercial lot').click()
  await expect(page.locator('#trend .empty')).toContainText('A trend needs at least two quarters with 2 or more deals each. No quarter has that so far. Try a longer period.')
})

test('the trend uses exactly the row\'s filtered deals (R1)', async ({ page }) => {
  await open(page)
  await page.locator('#fType').selectOption({ label: 'House and lot' })
  await page.locator('#fMore').click()
  await page.locator('[data-fk="beds"][data-v="3"]').click()
  await page.keyboard.press('Escape')
  const xe = row(page, 'Xavier Estates', 'House and lot')
  const deals: Deal[] = (await (await page.request.get('/api/deals')).json()).deals
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  const mine = deals.filter(
    (d) => d.location.name === 'Xavier Estates' && d.type.name === 'House and lot' && d.beds === 3 && (Date.parse(today) - Date.parse(d.date)) / 86_400_000 / 30.44 <= 24,
  )
  if (mine.length >= 5) {
    await xe.click()
    await expect(page.locator('#trendFoot')).toContainText(`Based on ${mine.length} closed deals`)
    const q = (iso: string) => Number(iso.slice(0, 4)) * 4 + Math.floor((Number(iso.slice(5, 7)) - 1) / 3)
    for (const t of await page.locator('#trend svg circle title').allTextContents()) {
      const [label, n] = [t.split(':')[0], Number(t.match(/from (\d+) deals/)![1])]
      const [qq, yy] = [Number(label[1]), Number('20' + label.slice(-2))]
      expect(mine.filter((d) => q(d.date) === yy * 4 + qq - 1).length, t).toBe(n)
    }
  } else {
    await expect(xe.locator('.c-note')).toHaveText(`${mine.length} of 5 deals needed`)
    await page.locator('#lowToggle').click()
    await xe.click()
    await expect(page.locator('#trend .empty')).toContainText(`This row has ${mine.length}.`)
  }
})

for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, WIDE]) {
  test(`trend x labels never collide at ${size.width} px (MR-007, R14)`, async ({ page }) => {
    await open(page, size)
    await row(page, 'Xavier Estates', 'Residential lot').click()
    for (const by of ['q', 'h', 'y']) {
      await page.locator(`[data-tp="${by}"]`).click()
      await expect(page.locator('#trend svg')).toBeVisible()
      const boxes = await page.locator('#trend svg .xlabel').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
      for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1].right, `${by} ${i}`).toBeLessThanOrEqual(boxes[i].left)
    }
  })
}

test('"See the {n} deals" opens Closed deals with the row\'s filters and no search (MR-008, R2)', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await page.goto('/deals')
  await page.locator('#dSearch').fill('B22')
  await page.getByRole('link', { name: 'Market rates' }).click()
  await row(page, 'Xavier Estates', 'Residential lot').click()
  const link = page.locator('#seeDeals')
  const n = (await link.textContent())!.match(/\d+/)![0]
  await link.click()
  await expect(page).toHaveURL(/\/deals$/)
  await expect(page.locator('#listCount')).toHaveText(`${n} closed deals`)
  await expect(page.locator('#dSearch')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0)
  await expect(page.locator('#fLoc option:checked')).toHaveText('Xavier Estates')
  await expect(page.locator('#fType option:checked')).toHaveText('Residential lot')
})

test('a Size choice carries over "See the deals" as a hidden filter (§7.2.3)', async ({ page }) => {
  await open(page)
  await page.locator('#fMore').click()
  await page.locator('[data-fk="band"][data-v="u"]').click()
  await page.keyboard.press('Escape')
  await row(page, 'Centrio', 'Condo unit').click()
  const n = (await page.locator('#seeDeals').textContent())!.match(/\d+/)![0]
  await page.locator('#seeDeals').click()
  await expect(page.locator('#listCount')).toHaveText(`${n} closed deals`)
  await expect(page.locator('#fMore')).toHaveAttribute('aria-label', 'Filters, 1 on')
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible()
  await page.locator('#fMore').click()
  await page.locator('#fReset').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('#fMore')).toHaveAttribute('aria-label', 'Filters')
})

test('the table folds at 820 px (MR-010)', async ({ page }) => {
  await open(page, { width: 820, height: 1180 })
  const first = page.locator('#summary tbody tr[data-key]').first()
  await expect(first.locator('.c-type')).toBeHidden()
  await expect(first.locator('.c-loc .m2.sub')).toBeVisible()
  await expect(first.locator('.c-loc .m2.sub')).toHaveText('Condo unit · 8 deals')
  await expect(first.locator('.c-mid .m2.sub')).toHaveText('₱127,250 to ₱137,000')
  await expect(page.locator('#summary th .m2').first()).toHaveText('Location and type')
  await expectNoSidewaysScroll(page)
})

test('empty states (§7.2.2, §7.2.3)', async ({ page }) => {
  await open(page)
  await page.locator('#fType').selectOption({ label: 'Agricultural lot' })
  await page.locator('#fPeriod').selectOption({ label: 'Last 3 months' })
  await expect(page.locator('#summary td.c-all')).toHaveText('No closed deals match these filters.')
  await expect(page.locator('#trend')).toHaveText('Select a row with enough deals to see its trend.')
  await expect(page.locator('#trendFoot')).toHaveCount(0)
  await page.route('**/api/bootstrap', async (r) => {
    const res = await r.fetch()
    await r.fulfill({ response: res, json: { ...(await res.json()), deals: [] } })
  })
  await page.goto('/market-rates')
  await expect(page.locator('#summary td.c-all')).toHaveText('No closed deals yet. Market rates show here once deals are added.')
  await expect(page.locator('#trend')).toHaveText('The price trend shows here once deals are added.')
})
