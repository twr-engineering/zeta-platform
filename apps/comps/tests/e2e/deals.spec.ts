import { expect, test, type APIRequestContext, type Page } from './fixtures'

import { expectNoSidewaysScroll } from './helpers'
import { ADMIN_STATE } from './users'

// Add and edit a deal (app PRD §7.4, ADD-001..013) on the Appendix D set (global setup reseeds).
// R4: every row of §8.6.3 in the browser and over HTTP. R5: leaving an edit asks, pin moves
// included. R15: placeholders read as examples. Checks that save run only in chromium-light,
// one at a time, and delete what they add.
test.use({ storageState: ADMIN_STATE })

type Boot = {
  locations: { id: number; name: string; lat: number; lng: number; hidden: boolean }[]
  types: { id: number; name: string }[]
  deals: { id: number; details: string | null; pp: number; location: { id: number | null; name: string }; type: { id: number | null; name: string }; createdAt: string; createdBy: number; note: string | null }[]
}
const boot = async (request: APIRequestContext): Promise<Boot> => (await request.get('/api/bootstrap')).json()
const writes = () => test.skip(test.info().project.name !== 'chromium-light', 'writes run once, in chromium-light')
const lightOnly = () => test.skip(/dark/.test(test.info().project.name), 'theme does not change validation')

async function openNew(page: Page) {
  await page.goto('/deals/new')
  await expect(page.locator('#aType')).toBeEnabled()
  await expect(page.locator('#aType')).not.toHaveValue('')
}
const more = async (page: Page) => {
  const d = page.locator('#aMore')
  if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) await d.locator('summary').click()
}
const toast = (page: Page) => page.locator('#toast')

// ---------- read-only ----------

test('Townhouse shows and hides the right fields (ADD-001)', async ({ page }) => {
  await openNew(page)
  await page.locator('#aType').selectOption({ label: 'Townhouse' })
  await more(page)
  for (const id of ['aLotA', 'aBeds', 'aCond', 'aYear', 'aStorey', 'aFurn', 'aBaths', 'aPark']) await expect(page.locator(`#${id}`)).toBeVisible()
  for (const id of ['aFront', 'aCorner', 'aRidge', 'aFloor', 'aParkIncl']) await expect(page.locator(`#${id}`)).toHaveCount(0)
  await expect(page.locator('#aAreaL')).toHaveText('Floor area (sqm)')
  await expect(page.locator('#aBeds option')).toHaveText(['Select', '1 bedroom', '2 bedrooms', '3 bedrooms', '4 bedrooms', '5 or more'])
  await page.locator('#aType').selectOption({ label: 'Condo unit' })
  await expect(page.locator('#aBeds option').nth(1)).toHaveText('Studio')
  await page.locator('#aBeds').selectOption('0')
  await page.locator('#aType').selectOption({ label: 'House and lot' })
  await expect(page.locator('#aBeds')).toHaveValue('') // a picked Studio is cleared for a non-condo
  await page.locator('#aType').selectOption({ label: 'Residential lot' })
  await expect(page.locator('#aAreaL')).toHaveText('Lot area (sqm)')
  await expect(page.locator('#aFrontL')).toHaveText('Frontage (m), optional')
  await page.locator('#aLoc').selectOption({ label: 'Uptown main road, north stretch' })
  await expect(page.locator('#aFrontL')).toHaveText('Frontage (m)')
  await expect(page.locator('#aBLL')).toHaveText('Property details, optional')
  await expect(page.locator('#aBL')).toHaveAttribute('placeholder', 'Street or landmark, such as corner of Tiano and Hayes')
  await expectNoSidewaysScroll(page)
})

test('placeholders read as examples on the add form and both Settings dialogs (R15, ADD-007)', async ({ page }) => {
  const allowed = [
    'Optional', 'Search block and lot, code or place', 'ZTP777 or a listing link', 'Block and lot, such as B22 L27', 'Unit number, such as Tower 2, 14B',
    'Street or landmark, such as corner of Tiano and Hayes', 'Anything that helps the team compare, such as beside the clubhouse or road widening planned',
  ]
  const check = async () => {
    for (const p of await page.locator('[placeholder]').evaluateAll((els) => els.map((e) => e.getAttribute('placeholder') ?? ''))) {
      expect(p.startsWith('Such as ') || allowed.includes(p), p).toBe(true)
    }
  }
  await openNew(page)
  for (const t of ['Residential lot', 'House and lot', 'Condo unit']) {
    await page.locator('#aType').selectOption({ label: t })
    await more(page)
    await check()
  }
  await page.goto('/settings')
  await page.getByRole('button', { name: '+ Add subdivision or area' }).click()
  await check()
  await page.keyboard.press('Escape')
  await page.goto('/settings?tab=types')
  await page.getByRole('button', { name: '+ Add property type' }).click()
  await check()
})

test('property details are capped at 40 characters and notes at 300 (ADD-006)', async ({ page }) => {
  await openNew(page)
  await page.locator('#aBL').fill('x'.repeat(45))
  await expect(page.locator('#aBL')).toHaveValue('x'.repeat(40))
  await more(page)
  await expect(page.locator('#aNote')).toHaveAttribute('maxlength', '300')
})

test('the location is suggested from the pin in three distance bands (ADD-008)', async ({ page }) => {
  await openNew(page)
  const hint = page.locator('#aLocHint')
  await page.locator('#aPin').fill('8.4515, 124.6265')
  await expect(page.locator('#aLoc option:checked')).toHaveText('Pueblo de Oro')
  await expect(hint).toHaveText('nearest saved place is 0.8 km away, check it is right, or add a new one at the end of the list')
  await expect(hint).toHaveClass(/warn/)
  await page.locator('#aPin').fill('8.462, 124.629')
  await expect(hint).toHaveText('suggested from the pin, change it if wrong')
  await expect(hint).not.toHaveClass(/warn/)
  await page.locator('#aPin').fill('8.75, 124.95')
  await expect(page.locator('#aLoc')).toHaveValue('')
  await expect(hint).toHaveText('no saved place near the pin, choose one, or add a new one at the end of the list')
  // Picking by hand clears the hint and stops suggestions for this draft.
  await page.locator('#aLoc').selectOption({ label: 'Centrio' })
  await expect(hint).toHaveText('')
  await page.locator('#aPin').fill('8.462, 124.629')
  await expect(page.locator('#aLoc option:checked')).toHaveText('Centrio')
})

test('the preview warns in red over 35% off a middle of 5 or more, on phones too (ADD-005)', async ({ page, request }) => {
  const b = await boot(request)
  const pps = b.deals.filter((d) => d.location.name === 'Xavier Estates' && d.type.name === 'Residential lot').map((d) => d.pp).sort((x, y) => x - y)
  expect(pps.length).toBeGreaterThanOrEqual(5)
  const i = (pps.length - 1) / 2
  const med = pps[Math.floor(i)] + (pps[Math.ceil(i)] - pps[Math.floor(i)]) * (i - Math.floor(i))
  const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-US')
  for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await openNew(page)
    await page.locator('#aLoc').selectOption({ label: 'Xavier Estates' })
    await page.locator('#aArea').fill('100')
    await page.locator('#aPrice').fill(String(Math.round(med * 1.4 * 100)))
    const note = page.locator('#aPreview .note')
    await expect(note).toHaveText(`40% above the middle price of ${peso(med)}. Check the area and price.`)
    await expect(note).toHaveClass(/warn/)
    await expect(note).toBeVisible()
    await page.locator('#aPrice').fill(String(Math.round(med * 100)))
    if (size.width > 560) await expect(note).toHaveText(`Middle price here: ${peso(med)} per sqm (${pps.length} deals).`)
    else await expect(note).toBeHidden()
  }
})

// ---------- R4: every row of §8.6.3 ----------

type Row = { name: string; selects?: [string, string][]; fills?: [string, string][]; field: string; message: string }
const ROWS: Row[] = [
  { name: '1 pin does not parse', fills: [['aPin', 'abc']], field: 'aPin', message: 'Enter the pin as latitude, longitude, for example 8.48930, 124.66200, or click the map.' },
  { name: '2 pin outside CDO', fills: [['aPin', '124.662, 8.4893']], field: 'aPin', message: 'That pin is outside Cagayan de Oro. Check that latitude comes first and longitude second.' },
  { name: '3 no location', selects: [['aLoc', '']], field: 'aLoc', message: 'Choose the subdivision or area.' },
  { name: '4 condo details', selects: [['aType', 'Condo unit']], fills: [['aBL', '']], field: 'aBL', message: 'Enter the property details, such as the tower and unit number.' },
  { name: '4 lot details', fills: [['aBL', '']], field: 'aBL', message: 'Enter the property details, such as the block and lot. It is how you trace the deal back to ERP213 and spot a deal entered twice.' },
  { name: '5 area missing', fills: [['aArea', '']], field: 'aArea', message: 'Enter the lot area in sqm.' },
  { name: '6 area range (ADD-002)', fills: [['aArea', '5']], field: 'aArea', message: 'Check the lot area. It should be between 10 and 1,000,000 sqm.' },
  { name: '7 house lot area missing', selects: [['aType', 'House and lot']], fills: [['aArea', '200']], field: 'aLotA', message: 'Enter the lot area in sqm, from the title.' },
  { name: '8 house lot area range', selects: [['aType', 'House and lot']], fills: [['aArea', '200'], ['aLotA', '5']], field: 'aLotA', message: 'Check the lot area. It should be between 10 and 1,000,000 sqm.' },
  { name: '9 frontage range', fills: [['aFront', '3000']], field: 'aFront', message: 'Check the frontage. It should be between 1 and 2,000 metres.' },
  { name: '10 lot in an Area needs frontage (ADD-003)', selects: [['aType', 'Commercial lot'], ['aLoc', 'Uptown main road, north stretch']], fills: [['aBL', '']], field: 'aFront', message: 'A lot outside a subdivision needs its frontage in metres.' },
  { name: '11 price missing', fills: [['aPrice', '']], field: 'aPrice', message: 'Enter the sold price. Only enter it if you know it is accurate.' },
  { name: '12 duplicate (ADD-004)', fills: [['aBL', 'b22-l27'], ['aArea', '580'], ['aPrice', '21,500,000']], field: 'aBL', message: 'This looks like a deal already saved: same location, b22-l27 and sold price. Check the deal list before adding it again.' },
  { name: '13 no date', fills: [['aDate', '']], field: 'aDate', message: 'Enter the date sold.' },
  { name: '14 future date', fills: [['aDate', '2099-01-01']], field: 'aDate', message: 'The date sold is in the future.' },
  { name: '15 before 2000', fills: [['aDate', '1999-12-31']], field: 'aDate', message: 'Check the date sold. Deals from before 2000 are too old to use as comps.' },
  { name: '16 price per sqm', fills: [['aPrice', '20000']], field: 'aPrice', message: 'That works out to ₱40 per sqm, which looks wrong. Check the area and the sold price.' },
  { name: '17 days on market', fills: [['aDom', '-1']], field: 'aDom', message: 'Check the days on market. It should be between 0 and 3,650.' },
  { name: '18 asking far below', fills: [['aAsking', '1000']], field: 'aAsking', message: 'The asking price looks far below the sold price. Check both numbers.' },
  { name: '19 year built', selects: [['aType', 'House and lot']], fills: [['aArea', '200'], ['aLotA', '300'], ['aYear', '1800']], field: 'aYear', message: 'Check the year built.' },
  { name: '20 floor level', selects: [['aType', 'Condo unit']], fills: [['aFloor', '0']], field: 'aFloor', message: 'Check the floor level.' },
  { name: '21 bad link', fills: [['aCode', 'http://bad link']], field: 'aCode', message: 'That link does not look right. Paste the full address, or type a listing code such as ZTP777.' },
]
const BASE: [string, string][] = [['aPin', '8.48930, 124.66200'], ['aBL', 'B77 L1'], ['aArea', '500'], ['aPrice', '15,000,000'], ['aDate', '2026-01-15']]
const IN_MORE = new Set(['aDom', 'aAsking', 'aYear', 'aFloor', 'aCode'])

for (const r of ROWS) {
  test(`browser blocks row ${r.name} (R4)`, async ({ page }) => {
    lightOnly()
    await openNew(page)
    for (const [id, v] of BASE) await page.locator(`#${id}`).fill(v)
    await page.locator('#aLoc').selectOption({ label: 'Xavier Estates' })
    for (const [id, label] of r.selects ?? []) await page.locator(`#${id}`).selectOption(label ? { label } : '')
    if ((r.fills ?? []).some(([id]) => IN_MORE.has(id))) await more(page)
    for (const [id, v] of r.fills ?? []) await page.locator(`#${id}`).fill(v)
    await page.locator('#aSave').click()
    const field = page.locator(`#${r.field}`)
    await expect(page.locator(`#${r.field}Err`)).toHaveText(r.message)
    await expect(page.locator('.ferr')).toHaveCount(1)
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toHaveAttribute('aria-describedby', `${r.field}Err`)
    await expect(field).toBeFocused()
    await expect(page.locator('#aErr')).toBeHidden()
    await expect(page).toHaveURL(/\/deals\/new$/)
    // Typing in the field removes its error.
    if (r.field !== 'aLoc' && r.field !== 'aDate') {
      await field.press('End')
      await field.pressSequentially('1')
      await expect(page.locator('.ferr')).toHaveCount(0)
    }
  })
}

test('the API answers every row of §8.6.3 with 422, the same copy and the field (R4)', async ({ request, baseURL }) => {
  lightOnly()
  const b = await boot(request)
  const loc = (n: string) => b.locations.find((l) => l.name === n)!.id
  const type = (n: string) => b.types.find((t) => t.name === n)!.id
  const base = { locationId: loc('Xavier Estates'), typeId: type('Residential lot'), pin: '8.48930, 124.66200', details: 'B77 L1', area: '500', price: '15,000,000', date: '2026-01-15' }
  const key: Record<string, string> = { aPin: 'pin', aLoc: 'locationId', aBL: 'details', aArea: 'area', aLotA: 'lotArea', aFront: 'frontage', aPrice: 'price', aDate: 'date', aDom: 'dom', aAsking: 'asking', aYear: 'year', aFloor: 'floor', aCode: 'codeOrLink' }
  for (const r of ROWS) {
    const body: Record<string, unknown> = { ...base }
    for (const [id, v] of r.selects ?? []) {
      if (id === 'aType') body.typeId = type(v)
      if (id === 'aLoc') body.locationId = v ? loc(v) : null
    }
    for (const [id, v] of r.fills ?? []) body[key[id]] = v
    const res = await request.post('/api/deals', { data: body, headers: { origin: baseURL! } })
    expect(res.status(), r.name).toBe(422)
    expect(await res.json(), r.name).toEqual({ error: { code: 'validation', message: r.message, field: key[r.field] } })
  }
  const bad = await request.post('/api/deals', { data: { ...base, extra: 1 }, headers: { origin: baseURL! } })
  expect(bad.status()).toBe(400)
  const noOrigin = await request.post('/api/deals', { data: base })
  expect(noOrigin.status()).toBe(403)
})

// ---------- leaving and drafts ----------

test('a new draft survives another tab; Back with text asks "Discard this deal?" (ADD-013, §7.4.8)', async ({ page }) => {
  await page.goto('/cma')
  await page.getByRole('link', { name: '+ Add a deal' }).click()
  await expect(page.locator('#aType')).toBeEnabled()
  await page.locator('#aArea').fill('321')
  await page.getByRole('link', { name: 'CMA' }).click()
  await expect(page).toHaveURL(/\/cma$/)
  await expect(page.locator('#confirmDlg')).not.toHaveAttribute('open', '')
  await page.getByRole('link', { name: '+ Add a deal' }).click()
  await expect(page.locator('#aArea')).toHaveValue('321')
  await page.getByRole('link', { name: 'Back' }).click()
  const dlg = page.getByRole('dialog', { name: 'Discard this deal?' })
  await expect(dlg).toContainText('What you typed will be lost.')
  await dlg.getByRole('button', { name: 'Discard' }).click()
  await expect(page).toHaveURL(/\/cma$/) // the last main screen
  await page.getByRole('link', { name: '+ Add a deal' }).click()
  await expect(page.locator('#aArea')).toHaveValue('')
  // Only text counts: a select alone leaves without a question.
  await page.locator('#aType').selectOption({ label: 'Townhouse' })
  await page.locator('#aClear').click()
  await expect(page).toHaveURL(/\/cma$/)
})

test('an unknown deal id goes to the list with "That deal is no longer saved."', async ({ page }) => {
  await page.goto('/deals/999999/edit')
  await expect(page).toHaveURL(/\/deals$/)
  await expect(toast(page)).toHaveText('That deal is no longer saved.')
})

test('edit: filled from the deal; moving only the pin and clicking a tab asks (R5, ADD-010)', async ({ page, request }) => {
  const b = await boot(request)
  const deal = b.deals.find((d) => d.details === 'B22 L27')!
  await page.goto(`/deals/${deal.id}/edit`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit closed deal')
  await expect(page.locator('#aPrice')).toHaveValue('21,500,000')
  await expect(page.locator('#aLoc option:checked')).toHaveText('Xavier Estates')
  await expect(page.locator('#aDelete')).toBeVisible()
  await expect(page.locator('#aSave')).toHaveText('Save changes')
  await expect(page.locator('#aSaveMore')).toHaveCount(0)
  await expect(page.locator('#aMore')).toHaveAttribute('open', '')
  // No change: leaves without a question.
  await page.getByRole('link', { name: 'Market rates' }).click()
  await expect(page).toHaveURL(/\/market-rates$/)

  await page.goto(`/deals/${deal.id}/edit`)
  await expect(page.locator('#aPin')).not.toHaveValue('')
  const before = await page.locator('#aPin').inputValue()
  await page.getByTestId('pinmap').click({ position: { x: 60, y: 60 } })
  await expect(page.locator('#aPin')).not.toHaveValue(before)
  const moved = await page.locator('#aPin').inputValue()
  await page.getByRole('link', { name: 'Market rates' }).click()
  const dlg = page.getByRole('dialog', { name: 'Discard your changes?' })
  await expect(dlg).toContainText('Your edits to this deal will be lost.')
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(new RegExp(`/deals/${deal.id}/edit$`))
  await expect(page.locator('#aPin')).toHaveValue(moved)
  // Browser Back asks too.
  await page.goBack()
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('#aPin')).toHaveValue(moved)
  // The account menu asks too; Discard continues to where the user was going.
  await page.getByRole('button', { name: 'Your account' }).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await dlg.getByRole('button', { name: 'Discard' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  // Nothing was saved.
  expect((await boot(request)).deals.find((d) => d.id === deal.id)).toBeTruthy()
})

// ---------- saving (chromium-light) ----------

test.describe.serial('saving', () => {
  test('save and add another keeps location, type and date (ADD-011), then edit keeps the created stamps (ADD-012)', async ({ page, request, baseURL }) => {
    writes()
    await openNew(page)
    await page.locator('#aPin').fill('8.47800, 124.64700')
    await page.locator('#aLoc').selectOption({ label: 'Centrio' })
    await page.locator('#aType').selectOption({ label: 'Condo unit' })
    await page.locator('#aBL').fill('E2E T9 9Z')
    await page.locator('#aArea').fill('40')
    await page.locator('#aPrice').fill('4000000')
    await page.locator('#aDate').fill('2026-10-12')
    await page.locator('#aSaveMore').click()
    await expect(toast(page)).toHaveText('Deal saved: Centrio, ₱100,000 per sqm')
    await expect(page.locator('#aLoc option:checked')).toHaveText('Centrio')
    await expect(page.locator('#aType option:checked')).toHaveText('Condo unit')
    await expect(page.locator('#aDate')).toHaveValue('2026-10-12')
    for (const id of ['aPin', 'aBL', 'aArea', 'aPrice']) await expect(page.locator(`#${id}`)).toHaveValue('')
    await expect(page.locator('#aPin')).toBeFocused()

    const saved = (await boot(request)).deals.find((d) => d.details === 'E2E T9 9Z')!
    expect(saved).toBeTruthy()
    await page.goto(`/deals/${saved.id}/edit`)
    await expect(page.locator('#aBL')).toHaveValue('E2E T9 9Z')
    await more(page)
    await page.locator('#aNote').fill('edited by e2e')
    await page.locator('#aSave').click()
    await expect(page).toHaveURL(/\/deals$/)
    await expect(toast(page)).toHaveText('Deal updated: Centrio, ₱100,000 per sqm')
    const after = (await boot(request)).deals.find((d) => d.id === saved.id)!
    expect(after).toMatchObject({ note: 'edited by e2e', createdAt: saved.createdAt, createdBy: saved.createdBy })

    // Delete from the edit screen, then Undo (§7.4.7, §7.1.8).
    await page.goto(`/deals/${saved.id}/edit`)
    await page.locator('#aDelete').click()
    const dlg = page.getByRole('dialog', { name: 'Delete this deal?' })
    await expect(dlg).toContainText('Centrio, E2E T9 9Z, sold ₱4M on 12 Oct 2026. It will be removed for everyone.')
    await dlg.getByRole('button', { name: 'Delete deal' }).click()
    await expect(page).toHaveURL(/\/deals$/)
    await expect(toast(page)).toContainText('Deal deleted')
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(toast(page)).toHaveText('Deal restored')
    expect((await boot(request)).deals.some((d) => d.id === saved.id)).toBe(true)
    await request.delete(`/api/deals/${saved.id}`, { headers: { origin: baseURL! } })
  })

  test('add a place from the list: prefilled with the pin, selected after, the draft kept (ADD-009)', async ({ page, request, baseURL }) => {
    writes()
    await openNew(page)
    await page.locator('#aPin').fill('8.45000, 124.70000')
    await page.locator('#aBL').fill('B1 L2')
    await page.locator('#aArea').fill('250')
    await page.locator('#aLoc').selectOption('__new')
    const dlg = page.getByRole('dialog', { name: 'Add a subdivision or area' })
    await expect(dlg).toContainText('The map center is set to your pin. Move it to the middle of the subdivision or area if you can.')
    await expect(page.locator('#nlPin')).toHaveValue('8.45000, 124.70000')
    await page.locator('#nlName').fill('Test Place')
    await dlg.getByRole('button', { name: 'Add subdivision or area' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.locator('#aLoc option:checked')).toHaveText('Test Place')
    await expect(page.locator('#aLocHint')).toHaveText('just added')
    await expect(page.locator('#aLoc')).toBeFocused()
    await expect(page.locator('#aBL')).toHaveValue('B1 L2')
    await expect(page.locator('#aArea')).toHaveValue('250')
    const place = (await boot(request)).locations.find((l) => l.name === 'Test Place')!
    await request.delete(`/api/locations/${place.id}`, { headers: { origin: baseURL! } })
  })
})
