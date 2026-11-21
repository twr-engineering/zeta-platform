import { expect, test, type Page } from './fixtures'

import { expectNoSidewaysScroll } from './helpers'
import { ADMIN_STATE } from './users'

// Closed deals list (app PRD §7.1, CD-001..019) on the Appendix D set; expected values from D.5.
// R3, R8, R9, R10 are regressions. Writes run only in chromium-light, serially, and put back
// what they change.
test.use({ storageState: ADMIN_STATE })

const WIDE = { width: 1440, height: 900 }
const count = (page: Page) => page.locator('#listCount')
const sub = (page: Page) => page.locator('#listSub')
const rows = (page: Page) => page.locator('.drow')
const toast = (page: Page) => page.locator('#toast')
const writes = () => test.skip(test.info().project.name !== 'chromium-light', 'writes run once, in chromium-light')

async function open(page: Page, size = WIDE) {
  await page.setViewportSize(size)
  await page.goto('/deals')
  await expect(count(page)).toHaveText(/closed deal/)
}
const pick = (page: Page, id: 'fLoc' | 'fType' | 'fPeriod', label: string) => page.locator(`#${id}`).selectOption({ label })
async function search(page: Page, q: string) {
  await page.locator('#dSearch').fill(q)
  await page.waitForTimeout(200) // past the 120 ms debounce
  await expect(count(page)).toHaveText(q.trim() ? / found$/ : /deals?$/)
}

test('map and list side by side over 980 px, stacked at 980 and under (CD-001)', async ({ page }) => {
  await open(page, { width: 1280, height: 720 })
  const map = await page.locator('#dealMap').boundingBox()
  const list = await page.locator('.listcol').boundingBox()
  expect(map!.x + map!.width).toBeLessThanOrEqual(list!.x)
  await page.setViewportSize({ width: 820, height: 1180 })
  const map2 = await page.locator('#dealMap').boundingBox()
  const list2 = await page.locator('.listcol').boundingBox()
  expect(map2!.y + map2!.height).toBeLessThanOrEqual(list2!.y)
  await expectNoSidewaysScroll(page)
  await expect(page.locator('#mapHint')).toHaveText('Click an empty spot on the map to add a deal there.')
})

test('defaults: 72 deals, 20 rows, "Show all 72 deals" toggles to "Show fewer" (D.5, CD-004)', async ({ page }) => {
  await open(page)
  await expect(count(page)).toHaveText('72 closed deals')
  await expect(sub(page)).toHaveText('Choose a property type to see the middle price per sqm.')
  await expect(rows(page)).toHaveCount(20)
  await page.getByRole('button', { name: 'Show all 72 deals' }).click()
  await expect(rows(page)).toHaveCount(72)
  await page.getByRole('button', { name: 'Show fewer' }).click()
  await expect(rows(page)).toHaveCount(20)
  await pick(page, 'fPeriod', 'Any time')
  await expect(count(page)).toHaveText('75 closed deals')
  await expect(page.locator('#fPeriod')).toHaveClass(/on/)
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible()
  // D.5's 14 holds for a seed run on 4 Nov 2026 (unit-tested); here the count follows today.
  const deals: { date: string }[] = (await (await page.request.get('/api/deals')).json()).deals
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  const n3 = deals.filter((d) => (Date.parse(today) - Date.parse(d.date)) / 86_400_000 / 30.44 <= 3).length
  await pick(page, 'fPeriod', 'Last 3 months')
  await expect(count(page)).toHaveText(`${n3} closed deal${n3 === 1 ? '' : 's'}`)
})

test('a middle price only with one type and 5 or more deals (R3, CD-003)', async ({ page }) => {
  await open(page)
  await pick(page, 'fLoc', 'Uptown main road, south stretch')
  await pick(page, 'fType', 'Commercial lot')
  await expect(count(page)).toHaveText('4 closed deals')
  await expect(sub(page)).toHaveText('A middle price needs at least 5 deals. These filters have 4.')
  await expect(sub(page)).not.toContainText('₱')
  await pick(page, 'fLoc', 'Xavier Estates')
  await pick(page, 'fType', 'Residential lot')
  await expect(sub(page)).toContainText('Middle price ₱37,252 per sqm')
  await expect(sub(page).locator('.pill')).toHaveText('High confidence')
  // One type left by a location filter alone also gets a middle price.
  await pick(page, 'fType', 'Any type')
  await pick(page, 'fLoc', 'Uptown main road, south stretch')
  await expect(sub(page)).toHaveText('A middle price needs at least 5 deals. These filters have 4.')
})

test('sort headers and the select always agree (R9, CD-005)', async ({ page }) => {
  await open(page)
  const pp = page.locator('.dhead [data-sort="pp"]')
  await pp.click()
  await expect(page.locator('#sortBy')).toHaveValue('pp:desc')
  await expect(pp).toHaveAttribute('aria-label', 'Sort by per sqm, highest first')
  await expect(pp).toBeFocused()
  await pp.click()
  await expect(page.locator('#sortBy')).toHaveValue('pp:asc')
  await expect(pp).toHaveAttribute('aria-label', 'Sort by per sqm, lowest first')
  await expect(pp.locator('path')).toHaveAttribute('d', 'M6 15l6-6 6 6')
  const vals = await page.locator('.drow .c-pp').allTextContents()
  const nums = vals.map((v) => Number(v.replace(/[^\d]/g, '')))
  expect(nums).toEqual([...nums].sort((a, b) => a - b))
  const size = page.locator('.dhead [data-sort="size"]')
  await size.click()
  await expect(page.locator('#sortBy')).toHaveValue('size:desc')
  await size.click()
  await expect(page.locator('#sortBy')).toHaveValue('size:asc')
  await page.locator('#sortBy').selectOption('date:asc')
  await expect(page.locator('.dhead [data-sort="size"]')).toHaveAttribute('aria-pressed', 'false')
})

test('one house-form type splits Size into Lot and Floor (CD-006)', async ({ page }) => {
  await open(page)
  await pick(page, 'fType', 'House and lot')
  await expect(page.locator('.dhead')).toHaveText(/Property.*Lot.*Floor.*Per sqm/)
  await expect(page.locator('#cards')).toHaveClass(/bysize/)
  await page.locator('#sortBy').selectOption({ label: 'Largest lot first' })
  const lots = (await page.locator('.drow .c-lot').allTextContents()).map((v) => Number(v.replace(/[^\d]/g, '')) || 0)
  expect(lots).toEqual([...lots].sort((a, b) => b - a))
  await pick(page, 'fType', 'Condo unit')
  await expect(page.locator('#sortBy')).toHaveValue('size:desc') // lot sort became size, same direction
  const opt = page.locator('#sortBy option[value="lot:desc"]')
  await expect(opt).toHaveAttribute('hidden', '')
  await expect(opt).toHaveAttribute('disabled', '')
})

test('search: every word, counts, the outside note and "Show them" (CD-002, CD-007, CD-008)', async ({ page }) => {
  await open(page)
  await search(page, 'xavier b22-l27')
  await expect(count(page)).toHaveText('1 closed deal found')
  await search(page, 'xavier b23')
  await expect(count(page)).toHaveText('0 closed deals found')
  await expect(page.locator('.empty')).toContainText('No deal matches “xavier b23”. If it is not saved yet, you can add it.')
  await expect(page.locator('.empty').getByRole('link', { name: '+ Add a deal' })).toBeVisible()
  // Matches outside the filters (counted from all closed deals).
  await pick(page, 'fPeriod', 'Any time')
  await search(page, 'xavier')
  const all = Number((await count(page).textContent())!.match(/\d+/)![0])
  await pick(page, 'fType', 'Residential lot')
  const inside = Number((await count(page).textContent())!.match(/\d+/)![0])
  const k = all - inside
  await expect(page.locator('#searchNote')).toContainText(`${k} more deals match outside your filters.`)
  await page.getByRole('button', { name: 'Show them' }).click()
  await expect(page.locator('#fType')).toHaveValue('')
  await expect(page.locator('#fPeriod')).toHaveValue('9999')
  await expect(page.locator('#dSearch')).toHaveValue('xavier')
  await expect(page.locator('#searchNote')).toHaveCount(0)
  // In these filters only.
  await pick(page, 'fType', 'Condo unit')
  await expect(page.locator('.empty')).toContainText('No deal matches “xavier” in these filters.')
  // Escape clears; × clears and keeps focus.
  await page.locator('#dSearch').press('Escape')
  await expect(page.locator('#dSearch')).toHaveValue('')
  await page.locator('#dSearch').fill('b22')
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.locator('#dSearch')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0)
})

test('the Filters sheet: sections per type, choices toggle, the count includes search (R8, CD-009..011)', async ({ page }) => {
  await open(page)
  await pick(page, 'fType', 'Condo unit')
  await page.locator('#fMore').click()
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  await expect(page.locator('#filterT')).toBeFocused()
  await expect(sheet.locator('.fsec > .k')).toHaveText([/^Floor area \(sqm\)/, 'Bedrooms', 'Bathrooms', 'Parking slots', 'Floor level', 'Mode of payment', 'Furnishing'])
  await expect(sheet.locator('[data-fk="cbeds"]')).toHaveText(['Studio', '1BR', '2BR', '3BR+'])
  const one = sheet.locator('[data-fk="cbeds"][data-v="1"]')
  await one.click()
  await expect(one).toHaveAttribute('aria-checked', 'true')
  await expect(one).toBeFocused()
  await expect(page.locator('#fMore')).toHaveAttribute('aria-label', 'Filters, 1 on')
  await one.click()
  await expect(one).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('#fMore')).toHaveAttribute('aria-label', 'Filters')
  await one.click()
  await page.keyboard.press('Escape')
  await expect(page.locator('#fMore')).toBeFocused()
  // A new type clears every sheet choice (CD-009).
  await pick(page, 'fType', 'Residential lot')
  await expect(page.locator('#fMore')).toHaveAttribute('aria-label', 'Filters')
  // R8: the button counts search matches too.
  await pick(page, 'fType', 'Any type')
  await search(page, 'xavier b22')
  await page.locator('#fMore').click()
  await expect(sheet.locator('#fDone')).toHaveText('Show 1 deal')
  await expect(sheet.locator('.fnote')).toHaveText('Choose a property type to filter by bedrooms, lot area, frontage, parking and more.')
  await sheet.locator('[data-fk="band"][data-v="u"]').click()
  await expect(sheet.locator('#fDone')).toHaveText('Show 0 deals')
  await sheet.locator('#fReset').click()
  await sheet.locator('#fDone').click()
  await expect(sheet).toBeHidden()
})

test('the lot area slider filters and shows its range', async ({ page }) => {
  await open(page)
  await pick(page, 'fType', 'Residential lot')
  await pick(page, 'fPeriod', 'Any time')
  await page.locator('#fMore').click()
  const sec = page.locator('[data-range="larea"]')
  await expect(sec.locator('.rvt')).toHaveText('Any')
  await sec.locator('.nhi').fill('500')
  await sec.locator('.nhi').press('Enter')
  await expect(sec.locator('.rvt')).toHaveText('Up to 500')
  await page.keyboard.press('Escape')
  const sizes = (await page.locator('.drow .c-size').allTextContents()).map((v) => Number(v.replace(/[^\d]/g, '')))
  expect(sizes.length).toBeGreaterThan(0)
  expect(sizes.every((n) => n <= 500)).toBe(true)
  await expect(page.locator('#fMore')).toHaveAttribute('aria-label', 'Filters, 1 on')
})

test('details: order, asking pill, link, columns; 2 columns on a phone (CD-012..014, CD-017)', async ({ page }) => {
  await open(page)
  await search(page, 'b22-l27')
  await rows(page).first().click()
  await expect(rows(page).first()).toHaveAttribute('aria-expanded', 'true')
  const d = page.locator('.ddetail')
  await expect(d.locator('dt')).toHaveText(['Sold price', 'Date sold', 'Last asking price', 'Days on market', 'Frontage', 'Lot features', 'Mode of payment', 'Link'])
  await expect(d.locator('.vs')).toHaveText('▼2.3% below asking')
  await expect(d.locator('.vs')).toHaveAttribute('title', 'Sold 2.3% below asking')
  const link = d.getByRole('link', { name: /Zeta ZTP815/ })
  await expect(link).toHaveAttribute('href', 'https://zetagroup.ph/r/ZTP815/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  const cols = () => d.locator('dl').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(await cols()).toBe(4)
  await expect(d.getByRole('button', { name: 'Edit deal' })).toBeVisible()
  await expect(d.getByRole('button', { name: 'Delete' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await cols()).toBe(2)
  // Clicking the open row closes it; Enter opens.
  await rows(page).first().click()
  await expect(page.locator('.ddetail')).toHaveCount(0)
  await rows(page).first().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.ddetail')).toHaveCount(1)
})

test('details follow one order for each of the 11 default types', async ({ page }) => {
  const ORDER = ['Sold price', 'Date sold', 'Last asking price', 'Days on market', 'Bathrooms', 'Bedrooms', 'Parking', 'Storeys', 'Floor level', 'Frontage', 'Lot features', 'Location type', 'Mode of payment', 'Condition', 'Furnishing', 'Year built', 'Listing code', 'Link']
  await open(page)
  await pick(page, 'fPeriod', 'Any time')
  for (const t of ['Residential lot', 'House and lot', 'Commercial lot', 'Condo unit', 'Beach lot', 'Townhouse', 'Commercial building', 'Condotel unit', 'Warehouse', 'Industrial lot', 'Agricultural lot']) {
    await pick(page, 'fType', t)
    await page.locator('#sortBy').selectOption('date:desc')
    await rows(page).first().click()
    const labels = await page.locator('.ddetail dt').allTextContents()
    const idx = labels.map((l) => ORDER.indexOf(l))
    expect(idx.every((i) => i >= 0), t).toBe(true)
    expect(idx, t).toEqual([...idx].sort((a, b) => a - b))
  }
})

test('names not in Settings list, filter and get no Area label (R10, CD-018)', async ({ page }) => {
  await open(page)
  await expect(page.locator('#fLoc optgroup[label="Not in Settings"] option')).toContainText(['Old Masterson Road'])
  await pick(page, 'fPeriod', 'Any time')
  await pick(page, 'fLoc', 'Old Masterson Road')
  await expect(count(page)).toHaveText('1 closed deal')
  await rows(page).first().click()
  await expect(page.locator('.ddetail dt')).not.toContainText(['Location type'])
  await expect(page.locator('#fType optgroup[label="Not in Settings"] option')).toContainText(['Duplex'])
})

test('empty, loading and failure states (CD-019, §7.1.7)', async ({ page }) => {
  await open(page)
  await pick(page, 'fType', 'Agricultural lot')
  await pick(page, 'fPeriod', 'Last 3 months')
  await expect(page.locator('.empty')).toContainText('No matches')
  await page.locator('#emptyClear').click()
  await expect(count(page)).toHaveText('72 closed deals')

  await page.route('**/api/bootstrap', async (r) => {
    const res = await r.fetch()
    const body = await res.json()
    await r.fulfill({ response: res, json: { ...body, deals: [] } })
  })
  await page.goto('/deals')
  await expect(page.locator('.empty')).toContainText('No deals yet')
  await expect(page.locator('.empty')).toContainText('Closed deals show up here and on the map.')
  await expect(page.locator('.empty').getByRole('link', { name: '+ Add a deal' })).toHaveAttribute('href', '/deals/new')
  await page.unroute('**/api/bootstrap')

  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/bootstrap', async (r) => {
    await held
    await r.continue()
  })
  await page.goto('/deals', { waitUntil: 'domcontentloaded' })
  await expect(count(page)).toHaveText('Closed deals')
  await expect(page.locator('.listcol .skel')).toHaveCount(3)
  release()
  await expect(count(page)).toHaveText('72 closed deals')
})

test.describe.serial('writes', () => {
  test('delete with undo restores the same deal, open (CD-015)', async ({ page, request }) => {
    writes()
    await open(page)
    await search(page, 'b22-l27')
    const before = (await (await request.get('/api/deals')).json()).deals.find((d: { details: string }) => d.details === 'B22 L27')
    await rows(page).first().click()
    await page.locator('.ddetail').getByRole('button', { name: 'Delete' }).click()
    const dlg = page.getByRole('dialog', { name: 'Delete this deal?' })
    await expect(dlg).toContainText('Xavier Estates, B22 L27, sold ₱21.5M on')
    await dlg.getByRole('button', { name: 'Delete deal' }).click()
    await expect(toast(page)).toContainText('Deal deleted')
    await expect(count(page)).toHaveText('0 closed deals found')
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(toast(page)).toHaveText('Deal restored')
    await expect(rows(page).first()).toHaveAttribute('aria-expanded', 'true')
    const after = (await (await request.get('/api/deals')).json()).deals.find((d: { id: number }) => d.id === before.id)
    expect(after).toEqual(before)
  })

  test('edit from the details returns to the list with the deal open; long details clamp to 2 lines (CD-016)', async ({ page, request, baseURL }) => {
    writes()
    const boot = await (await request.get('/api/bootstrap')).json()
    const loc = boot.locations.find((l: { name: string }) => l.name === 'Uptown main road, north stretch').id
    const type = boot.types.find((t: { name: string }) => t.name === 'Residential lot').id
    const details = 'Block 14 Lot 3 beside the long drainage x'.slice(0, 40).trimEnd()
    const made = await request.post('/api/deals', {
      headers: { origin: baseURL! },
      data: { locationId: loc, typeId: type, pin: '8.48400, 124.65000', details, area: '300', frontage: '20', price: '9,000,000', date: '2026-10-20' },
    })
    expect(made.status()).toBe(201)
    const id = (await made.json()).deal.id
    await open(page, { width: 390, height: 844 })
    await search(page, 'drainage')
    const p1 = rows(page).first().locator('.p1')
    await expect(p1).toHaveAttribute('title', `Uptown main road, north stretch · ${details}`)
    const lines = () => p1.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))
    expect(await lines()).toBeLessThanOrEqual(2)
    expect(await p1.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await rows(page).first().click()
    expect(await p1.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    await page.locator('.ddetail').getByRole('button', { name: 'Edit deal' }).click()
    await expect(page).toHaveURL(new RegExp(`/deals/${id}/edit$`))
    await page.locator('#aMore summary').click()
    await page.locator('#aNote').fill('checked by e2e')
    await page.locator('#aSave').click()
    await expect(page).toHaveURL(/\/deals$/)
    await expect(page.locator(`.drow[data-id="${id}"]`)).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.ddetail .dnote p')).toHaveText('checked by e2e')
    await request.delete(`/api/deals/${id}`, { headers: { origin: baseURL! } })
  })
})
