import { expect, test, type Page } from './fixtures'

import { expectNoSidewaysScroll } from './helpers'
import { ADMIN_STATE } from './users'

// CMA (app PRD §7.3, CMA-001..010) on the Appendix D set, scenarios from D.5. Regressions R7, R11.
test.use({ storageState: ADMIN_STATE })

const WIDE = { width: 1440, height: 900 }
const result = (page: Page) => page.locator('#result')
const title = (page: Page) => page.locator('#nearTitle')

async function open(page: Page, size = WIDE) {
  await page.setViewportSize(size)
  await page.goto('/cma')
  await expect(page.locator('#sLoc')).toBeEnabled()
}
/** D.5: choose the place, then type its pin (place centers differ from the mean of deal pins). */
async function at(page: Page, loc: string, type: string, pin: string) {
  await page.locator('#sLoc').selectOption({ label: loc })
  await page.locator('#sType').selectOption({ label: type })
  await page.locator('#sPin').fill(pin)
  await page.locator('#sPin').press('Enter')
}
const searchOpen = async (page: Page) => {
  if (!(await page.locator('#rMore').evaluate((el) => (el as HTMLDetailsElement).open))) await page.locator('#rMore summary').click()
}

test('starts empty with the first shown place and type (R11, CMA-001)', async ({ page }) => {
  await open(page)
  await expect(page.locator('#sLoc option:checked')).toHaveText('Xavier Estates')
  await expect(page.locator('#sType option:checked')).toHaveText('Residential lot')
  await expect(page.locator('#sArea')).toHaveValue('')
  await expect(page.locator('#sAsking')).toHaveValue('')
  await expect(result(page)).toContainText('Enter the lot area to see a value')
  await expect(page.locator('#sPin')).toHaveValue(/^8\.48\d{3}, 124\.66\d{3}$/)
  await expect(page.locator('#rSum')).toHaveText('1 km, last 24 months')
  await expectNoSidewaysScroll(page)
})

test('a new pricing form clears the sizes; the same form keeps them (R11, CMA-002, CMA-003)', async ({ page }) => {
  await open(page)
  await page.locator('#sArea').fill('500')
  await page.locator('#sType').selectOption({ label: 'Commercial lot' })
  await expect(page.locator('#sArea')).toHaveValue('500')
  await page.locator('#sType').selectOption({ label: 'Condo unit' })
  await expect(page.locator('#sArea')).toHaveValue('')
  await expect(page.locator('#sAreaL')).toHaveText('Floor area (sqm)')
  await expect(page.locator('#sBeds')).toBeVisible()
  await page.locator('#sMore summary').click()
  for (const id of ['sBaths', 'sPark', 'sParkIncl', 'sFloor', 'sFurn']) await expect(page.locator(`#${id}`)).toBeVisible()
  for (const id of ['sFront', 'sCorner', 'sRidge', 'sCond', 'sYear', 'sLotA']) await expect(page.locator(`#${id}`)).toHaveCount(0)
  await page.locator('#sBeds').selectOption('0')
  await page.locator('#sType').selectOption({ label: 'House and lot' })
  await expect(page.locator('#sBeds')).toHaveValue('') // Studio cleared (C33)
  await page.locator('#sType').selectOption({ label: 'Residential lot' })
  await expect(page.locator('#sMore')).toHaveCount(0) // hidden for lot types
})

test('A1 and A5: estimate, comps nearest first, notes; ticks never remove comps (CMA-004, CMA-007, R7)', async ({ page }) => {
  await open(page)
  await at(page, 'Xavier Estates', 'Residential lot', '8.48900, 124.66200')
  await page.locator('#sArea').fill('500')
  await page.locator('#sFront').fill('20')
  await expect(title(page)).toHaveText('10 comps within 1 km')
  await expect(result(page).locator('.eyebrow')).toContainText('Estimated price for Residential lot, 500 sqm, 20 m frontage')
  await expect(result(page).locator('.big')).toHaveText('₱18.47M to ₱18.87M')
  await expect(result(page).locator('.confline')).toContainText('High confidence')
  await expect(result(page).locator('.confline')).toContainText('10 comps within 1 km, prices close together')
  await expect(result(page).locator('.stat .v')).toHaveText(['₱18.7M', '₱37,402'])
  await expect(result(page).locator('.resnote')).toHaveText(['5 of the 10 comps are corner lots, which may push this estimate up.'])
  const rows = page.locator('#near tbody tr')
  await expect(rows).toHaveCount(10)
  const dists = (await rows.locator('.n-away').allTextContents()).map((t) => Number(t.replace(/\D/g, '')))
  expect(dists).toEqual([120, 250, 301, 352, 400, 451, 503, 600, 704, 900])
  await expect(page.locator('#map')).toHaveAttribute('data-comps', '10')
  await expect(page.locator('#map')).toHaveAttribute('data-toofar', '2')
  await expect(page.locator('#near caption')).toHaveText('* corner lot')
  await searchOpen(page)
  await expect(page.locator('#rLikeT')).toHaveText('Only similar properties: similar lot size, frontage within 30% of 20 m')
  await expect(page.locator('#rSum')).toHaveText('1 km, last 24 months, similar only')
  // A5
  await page.locator('#sCorner').check()
  await page.locator('#sRidge').check()
  await page.locator('label.tag', { hasText: 'Sloped' }).click()
  await expect(title(page)).toHaveText('10 comps within 1 km')
  await expect(result(page).locator('.resnote')).toHaveText([
    '5 of the 10 comps are corner lots. Corner lots usually sell higher, so this estimate may be low for this one.',
    '2 of the 10 comps are recorded with a ridge view. Ridge view lots usually sell higher, so this estimate may be low for this one.',
    'Only 1 of the 10 comps is recorded as sloped. Sloped lots usually sell lower, so this estimate may be high for this one.',
  ])
  // A6: the asking price
  await page.locator('#sAsking').fill('21000000')
  await page.locator('#sAsking').blur()
  await expect(page.locator('#sAsking')).toHaveValue('21,000,000')
  await expect(result(page).locator('.stat').nth(2)).toContainText('12% above the middle estimate')
  // Tapping the picked terrain again clears it.
  await page.locator('label.tag', { hasText: 'Sloped' }).click()
  await expect(page.locator('#sTerr2')).not.toBeChecked()
})

test('D1: not enough comps, then "Change search settings" (CMA-005)', async ({ page }) => {
  await open(page)
  await at(page, 'Uptown main road, south stretch', 'Commercial lot', '8.47000, 124.63500')
  await page.locator('#sArea').fill('600')
  await page.locator('#sFront').fill('20')
  await searchOpen(page)
  await page.locator('#rRadius').fill('500')
  await expect(page.locator('#rRadiusV')).toHaveText('500 m')
  await expect(result(page).locator('.big')).toHaveText('Not enough comps yet')
  await expect(result(page)).toContainText('4 of the 5 needed commercial lot deals are within 500 m and similar to this one.')
  await expect(title(page)).toHaveText('4 comps within 500 m')
  await page.locator('#rMore summary').click() // close it
  await page.getByRole('button', { name: 'Change search settings' }).click()
  await expect(page.locator('#rMore')).toHaveAttribute('open', '')
  await expect(page.locator('#rRadius')).toBeFocused()
  await page.locator('#rRadius').fill('1000')
  await expect(title(page)).toHaveText('6 comps within 1 km')
  await expect(result(page).locator('.big')).toHaveText('₱23.7M to ₱26.4M')
  await expect(result(page).locator('.resnote').last()).toHaveText('Low confidence. Treat this as a starting point and check the comps below before quoting a number.')
})

test('B1 and C1: houses and condos (D.5)', async ({ page }) => {
  await open(page)
  await at(page, 'Xavier Estates', 'House and lot', '8.48900, 124.66200')
  await page.locator('#sArea').fill('200')
  await page.locator('#sLotA').fill('300')
  await page.locator('#sBeds').selectOption('3')
  await expect(title(page)).toHaveText('6 comps within 1 km')
  await expect(result(page).locator('.big')).toHaveText('₱13.8M to ₱16.3M')
  await expect(page.locator('#near thead th').nth(4)).toHaveText('Lot area')
  await searchOpen(page)
  await expect(page.locator('#rLikeT')).toHaveText('Only similar properties: floor area within 30% of 200 sqm, lot area within 30% of 300 sqm, same bedrooms (3BR)')
  await at(page, 'Centrio', 'Condo unit', '8.47800, 124.64700')
  await page.locator('#sArea').fill('40')
  await page.locator('#sBeds').selectOption('1')
  await expect(title(page)).toHaveText('5 comps within 1 km')
  await expect(result(page).locator('.big')).toHaveText('₱5.12M to ₱5.44M')
  await expect(page.locator('#near thead th').nth(4)).toHaveText('Bedrooms')
  await expect(page.locator('#near tbody .n-extra').first()).toHaveText('1BR')
})

test('search settings summary (CMA-008)', async ({ page }) => {
  await open(page)
  await page.locator('#sFront').fill('20')
  await searchOpen(page)
  await page.locator('#rRadius').fill('1250')
  await page.locator('#rMonths').selectOption('12')
  await expect(page.locator('#rSum')).toHaveText('1.25 km, last 12 months, similar only')
  await page.locator('#rLike').uncheck()
  await expect(page.locator('#rSum')).toHaveText('1.25 km, last 12 months')
  await page.locator('#sFront').fill('')
  await expect(page.locator('#rLikeWrap')).toHaveCount(0) // no criteria, no row
})

test('a bad pin is rejected and the old value restored (CMA-009)', async ({ page }) => {
  await open(page)
  const before = await page.locator('#sPin').inputValue()
  await page.locator('#sPin').fill('8.9, 124.6')
  await page.locator('#sPin').press('Enter')
  await expect(page.locator('#toast')).toHaveText('That pin is not valid. Use latitude, longitude inside Cagayan de Oro.')
  await expect(page.locator('#sPin')).toHaveValue(before)
})

test('the map: click moves the property; labels and legend (§9.4)', async ({ page }) => {
  await open(page)
  await expect(page.locator('#map')).toHaveAttribute('aria-label', 'Closed deals around the property. Click to move the property.')
  await expect(page.locator('#map .cmasubj .lab')).toHaveText('This property')
  await expect(page.locator('#map .mlab.dist')).toHaveText(['1 km', '500 m'])
  await expect(page.locator('#map .leaflet-cmacircles-pane path')).toHaveCount(2)
  const before = await page.locator('#sPin').inputValue()
  const box = (await page.locator('#map').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35)
  await expect(page.locator('#sPin')).not.toHaveValue(before)
  await expect(page.locator('.cmamap ~ .legend span, #map ~ .legend span')).toHaveText(['Comp within the distance', 'Too far', 'This property'])
  // The subject is kept when moving to another tab and back (§5.1).
  await page.locator('#sArea').fill('480')
  const moved = await page.locator('#sPin').inputValue()
  await page.getByRole('link', { name: 'Market rates' }).click()
  await page.getByRole('link', { name: 'CMA' }).click()
  await expect(page.locator('#sArea')).toHaveValue('480')
  await expect(page.locator('#sPin')).toHaveValue(moved)
})

test('the comps table stacks on a phone with "frontage" words', async ({ page }) => {
  await open(page, { width: 390, height: 844 })
  await at(page, 'Xavier Estates', 'Residential lot', '8.48900, 124.66200')
  await page.locator('#sArea').fill('500')
  await page.locator('#sFront').fill('20')
  await expect(page.locator('#near tbody tr').first().locator('.n-extra')).toHaveText('20 m * frontage')
  await expect(page.locator('#near thead')).toBeHidden()
  await expectNoSidewaysScroll(page)
})

test.describe.serial('Settings changes', { tag: '@write' }, () => {
  test('a renamed place follows; a hidden one falls back to the first shown place (CMA-010)', async ({ page }) => {
    await open(page)
    await page.locator('#sLoc').selectOption({ label: 'Centrio' })
    await page.getByRole('button', { name: 'Your account' }).click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    const edit = async (from: string, to: string) => {
      await page.getByRole('button', { name: `More actions for ${from}` }).click()
      await page.getByRole('menuitem', { name: 'Edit' }).click()
      await page.locator('#nlName').fill(to)
      await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await edit('Centrio', 'Centrio Towers')
    await page.getByRole('link', { name: 'CMA' }).click()
    await expect(page.locator('#sLoc option:checked')).toHaveText('Centrio Towers')
    // Hide it: the CMA falls back to the first shown place.
    await page.getByRole('button', { name: 'Your account' }).click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'More actions for Centrio Towers' }).click()
    await page.getByRole('menuitem', { name: 'Hide from the add form' }).click()
    await expect(page.locator('#toast')).toHaveText('Centrio Towers hidden from the add form')
    await page.getByRole('link', { name: 'CMA' }).click()
    await expect(page.locator('#sLoc option:checked')).toHaveText('Xavier Estates')
    // Put it back.
    await page.getByRole('button', { name: 'Your account' }).click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'More actions for Centrio Towers' }).click()
    await page.getByRole('menuitem', { name: 'Show in the add form' }).click()
    await expect(page.locator('#toast')).toHaveText('Centrio Towers shown in the add form')
    await edit('Centrio Towers', 'Centrio')
  })
})
