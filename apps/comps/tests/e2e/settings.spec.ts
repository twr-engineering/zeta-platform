import { expect, test, type Page } from '@playwright/test'

import { expectNoSidewaysScroll } from './helpers'
import { ADMIN_STATE } from './users'

// Settings (app PRD §7.5, SET-001..008) on the Appendix D sample set (global setup reseeds).
// Read-only checks run in every project; the writes run once (chromium-light), in order, and
// put everything back.
test.use({ storageState: ADMIN_STATE })

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Settings sections' })
const row = (page: Page, name: string) => page.locator('tbody tr', { has: page.locator('.s-name strong', { hasText: new RegExp(`^${name}$`) }) })
const toast = (page: Page) => page.locator('#toast')

test('tabs: counts, one Tab stop, arrow keys, and the tab in the URL (SET-001)', async ({ page }) => {
  await page.goto('/settings')
  const places = page.getByRole('tab', { name: /Subdivisions and areas/ })
  const types = page.getByRole('tab', { name: /Property types/ })
  await expect(page.locator('tbody tr').first()).toBeVisible()
  const rows = await page.locator('tbody tr').count()
  await expect(places.locator('.cnt')).toHaveText(String(rows))
  await expect(places).toHaveAttribute('tabindex', '0')
  await expect(types).toHaveAttribute('tabindex', '-1')
  await places.focus()
  await page.keyboard.press('ArrowRight')
  await expect(types).toBeFocused()
  await expect(types).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/\/settings\?tab=types$/)
  await page.keyboard.press('Tab')
  await expect(tabs(page).locator(':focus')).toHaveCount(0) // focus left the tab row
  await page.goto('/settings?tab=types')
  await expect(page.getByRole('tab', { name: /Property types/ })).toHaveAttribute('aria-selected', 'true')
})

test('types table: categories in order, and rows open the edit dialog by click or Enter (SET-002)', async ({ page }) => {
  await page.goto('/settings?tab=types')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  const cats = await page.locator('tbody .s-kind').allTextContents()
  const order = ['Residential', 'Commercial', 'Industrial', 'Agricultural']
  expect(cats.map((c) => order.indexOf(c))).toEqual([...cats.map((c) => order.indexOf(c))].sort((a, b) => a - b))
  await row(page, 'Warehouse').click()
  await expect(page.getByRole('dialog', { name: 'Edit Warehouse' })).toBeVisible()
  await expect(page.locator('#ntName')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await row(page, 'Townhouse').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Edit Townhouse' })).toBeVisible()
  await expect(page.getByRole('dialog').locator('.hint').first()).toHaveText(
    'Renaming also updates its 1 closed deal. How it is priced is locked while deals use it.',
  )
})

test('delete is disabled while deals use a place, with the reason (SET-005)', async ({ page, request, baseURL }) => {
  await page.goto('/settings')
  const kebab = page.getByRole('button', { name: 'More actions for Centrio' })
  await kebab.click()
  const menu = page.getByRole('menu', { name: 'Row actions' })
  await expect(menu.getByRole('menuitem').first()).toBeFocused()
  const del = menu.getByRole('menuitem', { name: /Delete/ })
  await expect(del).toHaveAttribute('aria-disabled', 'true')
  await expect(del).toContainText('Used by 11 closed deals. Hide it instead.')
  await del.click({ force: true })
  await expect(menu).toBeVisible() // the disabled item leaves the menu open
  await menu.getByRole('menuitem', { name: 'Edit' }).focus()
  await page.keyboard.press('ArrowUp') // wraps from the first item to the last
  await expect(del).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(kebab).toBeFocused()
  await expect(kebab).toHaveAttribute('aria-expanded', 'false')

  const boot = await (await request.get('/api/bootstrap')).json()
  const centrio = boot.locations.find((l: { name: string }) => l.name === 'Centrio')
  const res = await request.delete(`/api/locations/${centrio.id}`, { headers: { origin: baseURL! } })
  expect(res.status()).toBe(409)
  expect((await res.json()).error).toEqual({ code: 'conflict', message: 'Used by 11 closed deals. Hide it instead.' })
})

test('a type in use has its pricing form locked; categories are exactly the four (SET-007, SET-008)', async ({ page, request, baseURL }) => {
  await page.goto('/settings?tab=types')
  await row(page, 'Condo unit').click()
  const dlg = page.getByRole('dialog', { name: 'Edit Condo unit' })
  const forms = dlg.locator('input[name=ntForm]')
  await expect(forms).toHaveCount(3)
  for (const f of await forms.all()) await expect(f).toBeDisabled()
  await expect(dlg.locator('input[name=ntCat]')).toHaveCount(4)
  expect(await dlg.locator('.tags .tag').allTextContents()).toEqual([' Residential', ' Commercial', ' Industrial', ' Agricultural'])
  // C27: switching to Agricultural keeps the locked condo card visible and checked.
  await dlg.getByLabel('Agricultural').check()
  await expect(dlg.locator('input[name=ntForm][value=condo]')).toBeChecked()

  const boot = await (await request.get('/api/bootstrap')).json()
  const condo = boot.types.find((t: { name: string }) => t.name === 'Condo unit')
  const patch = await request.patch(`/api/types/${condo.id}`, { headers: { origin: baseURL! }, data: { form: 'lot' } })
  expect(patch.status()).toBe(409)
  expect((await patch.json()).error.message).toBe('How it is priced is locked while deals use it.')
  const bad = await request.post('/api/types', { headers: { origin: baseURL! }, data: { name: 'Mixed', category: 'Mixed use', form: 'lot' } })
  expect(bad.status()).toBe(422)
  expect((await bad.json()).error.field).toBe('category')
})

test('the type dialog cards follow the category; Agricultural has no unit card', async ({ page }) => {
  await page.goto('/settings?tab=types')
  await page.getByRole('button', { name: '+ Add property type' }).click()
  const dlg = page.getByRole('dialog', { name: 'Add a property type' })
  await dlg.getByLabel(/A condo unit/).check()
  await dlg.getByLabel('Industrial').check()
  await expect(dlg.locator('.choice').nth(1)).toContainText('A building')
  await expect(dlg.locator('.choice').nth(1)).toContainText('For example: Warehouse, factory. Priced per sqm of floor area.')
  await dlg.getByLabel('Agricultural').check()
  await expect(dlg.locator('.choice')).toHaveCount(2)
  await expect(dlg.locator('input[name=ntForm][value=lot]')).toBeChecked()
})

test('duplicate names are refused ignoring case, naming the saved entry (SET-006)', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: '+ Add subdivision or area' }).click()
  const dlg = page.getByRole('dialog', { name: 'Add a subdivision or area' })
  await expect(page.locator('#nlName')).toBeFocused()
  await page.locator('#nlName').fill('xavier estates')
  await page.locator('#nlPin').fill('8.47, 124.65')
  await dlg.getByRole('button', { name: 'Add subdivision or area' }).click()
  await expect(dlg.getByRole('alert')).toHaveText('Xavier Estates is already on the list.')
  await page.locator('#nlName').fill('Somewhere New')
  await expect(dlg.getByRole('alert')).toBeHidden() // typing clears the error
  await page.locator('#nlPin').fill('14.6, 121.0')
  await dlg.getByRole('button', { name: 'Add subdivision or area' }).click()
  await expect(dlg.getByRole('alert')).toHaveText('Enter a map center inside Cagayan de Oro, for example 8.47000, 124.65000.')
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('loading shows skeletons; a failed load shows the banner and Try again repeats it (§5.3)', async ({ page }) => {
  let fail = true
  await page.route('**/api/bootstrap', async (route) => {
    if (fail) return route.fulfill({ status: 500, body: '{}' })
    await new Promise((r) => setTimeout(r, 400))
    return route.continue()
  })
  await page.goto('/settings')
  await expect(page.locator('.loaderr')).toHaveText(/The closed deals could not be loaded\. Check your connection and try again\./)
  await expect(page.locator('h1')).toHaveText('Settings')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.skel').first()).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()
  // The same banner on every screen.
  fail = true
  await page.goto('/market-rates')
  await expect(page.locator('.loaderr')).toContainText('The closed deals could not be loaded.')
})

test('phone layout: stacked rows with the deal word, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings')
  await expect(row(page, 'Centrio').locator('.s-n')).toHaveText('11 deals')
  await expect(page.locator('thead')).toBeHidden()
  await expectNoSidewaysScroll(page)
  await page.goto('/settings?tab=types')
  await expect(row(page, 'Office unit').locator('.s-n')).toHaveText('1 deal')
  await expectNoSidewaysScroll(page)
})

test.describe('writes', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium-light', 'writes run once'))

  test('rename moves every deal and reports it in one toast (SET-003)', async ({ page }) => {
    await page.goto('/settings')
    await row(page, 'Xavier Estates').click()
    const dlg = page.getByRole('dialog', { name: 'Edit Xavier Estates' })
    await expect(dlg.locator('.hint').first()).toHaveText('Renaming also updates its 28 closed deals.')
    await page.locator('#nlName').fill('Xavier Estates Ph 1')
    await dlg.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page)).toHaveText('28 deals moved to Xavier Estates Ph 1')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(row(page, 'Xavier Estates Ph 1').locator('.s-n')).toHaveText('28 deals')
    // Back again, so the other suites see the sample names.
    await row(page, 'Xavier Estates Ph 1').click()
    await page.locator('#nlName').fill('Xavier Estates')
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page)).toHaveText('28 deals moved to Xavier Estates')
  })

  test('hide and show from the row menu (SET-004)', async ({ page }) => {
    await page.goto('/settings?tab=types')
    await page.getByRole('button', { name: 'More actions for Beach lot' }).click()
    await page.getByRole('menuitem', { name: 'Hide from the add form' }).click()
    await expect(toast(page)).toHaveText('Beach lot hidden from the add form')
    await expect(row(page, 'Beach lot').locator('.pill')).toHaveText('Hidden')
    await expect(row(page, 'Beach lot')).toHaveClass(/low/)
    await expect(row(page, 'Beach lot').locator('.s-n')).toHaveText(/^2( deals)?$/) // its deals still count
    await page.getByRole('button', { name: 'More actions for Beach lot' }).click()
    await page.getByRole('menuitem', { name: 'Show in the add form' }).click()
    await expect(toast(page)).toHaveText('Beach lot shown in the add form')
    await expect(row(page, 'Beach lot').locator('.pill')).toHaveText('Shown')
  })

  test('add, rename and delete an unused place, with the confirm dialog', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: '+ Add subdivision or area' }).click()
    await page.locator('#nlName').fill('  E2E   Test Place ')
    await page.getByLabel(/Area outside subdivisions/).check()
    await page.locator('#nlPin').fill('8.4712312, 124.6512312')
    await page.getByRole('dialog').getByRole('button', { name: 'Add subdivision or area' }).click()
    await expect(toast(page)).toHaveText('E2E Test Place added')
    const r = row(page, 'E2E Test Place')
    await expect(r.locator('.s-kind')).toHaveText('Area')
    await expect(r.locator('.s-pin')).toHaveText('8.47123, 124.65123')
    await r.click()
    await expect(page.getByRole('dialog').locator('.hint').first()).toHaveText('No closed deals use it yet.')
    await page.locator('#nlName').fill('E2E Renamed Place')
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page)).toHaveText('E2E Test Place renamed to E2E Renamed Place')
    await page.getByRole('button', { name: 'More actions for E2E Renamed Place' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete E2E Renamed Place?' })
    await expect(confirm).toContainText('It will be removed from the list for everyone. No closed deals use it. This cannot be undone.')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(toast(page)).toHaveText('E2E Renamed Place deleted')
    await expect(row(page, 'E2E Renamed Place')).toHaveCount(0)
  })

  test('a save that fails shows the generic message in the dialog, which stays open', async ({ page }) => {
    await page.goto('/settings?tab=types')
    await page.route('**/api/types/*', (route) => route.fulfill({ status: 500, body: '{"error":{"code":"server"}}' }))
    await row(page, 'Warehouse').click()
    await page.locator('#ntName').fill('Warehouse big')
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Settings could not be saved. Try again.')
    await expect(page.getByRole('dialog', { name: 'Edit Warehouse' })).toBeVisible()
  })
})
