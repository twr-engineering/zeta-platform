import { expect, test, type Page } from './fixtures'

import { ADMIN_STATE } from './users'

// The Closed deals map and the Settings dialog map (app PRD §9, MAP-001..009, SET-009, R12) on
// the Appendix D set. Markers are canvas paths, so tests read the Leaflet map from its element.
test.use({ storageState: ADMIN_STATE })

type Deal = { id: number; lat: number; lng: number; pp: number; details: string | null; location: { name: string } }
const WIDE = { width: 1440, height: 900 }

async function open(page: Page, size = WIDE) {
  await page.setViewportSize(size)
  await page.goto('/deals')
  await expect(page.locator('#listCount')).toHaveText(/\d+ closed deal/)
  await expect(page.locator('#dealMap')).toHaveAttribute('data-markers', /\d+/)
}
/** A lat/lng → page pixel, through the map on #dealMap (or another map element). */
const pagePoint = (page: Page, lat: number, lng: number, sel = '#dealMap') =>
  page.locator(sel).evaluate(
    (el, ll) => {
      const map = (el as HTMLElement & { __map: { latLngToContainerPoint: (x: [number, number]) => { x: number; y: number } } }).__map
      const p = map.latLngToContainerPoint([ll.lat, ll.lng])
      const r = el.getBoundingClientRect()
      return { x: r.left + p.x, y: r.top + p.y }
    },
    { lat, lng },
  )
const zoom = (page: Page, sel = '#dealMap') => page.locator(sel).evaluate((el) => (el as HTMLElement & { __map: { getZoom: () => number } }).__map.getZoom())
const deals = async (page: Page): Promise<Deal[]> => (await (await page.request.get('/api/deals')).json()).deals

test('one marker per visible deal; type colors or price shades, with the legend (MAP-001, MAP-009)', async ({ page }) => {
  await open(page)
  await expect(page.locator('#dealMap')).toHaveAttribute('data-markers', '72')
  await expect(page.locator('#mapLegend .k')).toHaveText(['Residential lot', 'House and lot', 'Commercial lot', 'Condo unit', 'Beach lot', '8 other types (10 deals). Pick a type to see them alone.'])
  await page.locator('#fType').selectOption({ label: 'Residential lot' })
  await expect(page.locator('#mapLegend .grad')).toHaveText(/Lower per sqm\s+Higher/)
  await expect(page.locator('#mapLegend .grad i')).toHaveCount(5)
  const n = (await page.locator('#listCount').textContent())!.match(/\d+/)![0]
  await expect(page.locator('#dealMap')).toHaveAttribute('data-markers', n)
  await page.locator('#dSearch').fill('b22-l27')
  await expect(page.locator('#dealMap')).toHaveAttribute('data-markers', '1')
})

test('hover links map and list; a marker click opens and scrolls to its row (MAP-002)', async ({ page }) => {
  await open(page)
  await page.locator('#fType').selectOption({ label: 'Condo unit' })
  const d = (await deals(page)).find((x) => x.details === 'Tower 2, 22E')!
  const p = await pagePoint(page, d.lat, d.lng)
  await page.mouse.move(p.x, p.y)
  await expect(page.locator(`.drow[data-id="${d.id}"]`)).toHaveClass(/hov/)
  await page.mouse.move(p.x + 200, p.y + 200)
  await expect(page.locator(`.drow[data-id="${d.id}"]`)).not.toHaveClass(/hov/)
  await page.mouse.click(p.x, p.y)
  await expect(page.locator(`.drow[data-id="${d.id}"]`)).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#pinCard')).toHaveCount(0) // a marker click never drops a pin
  await expect(page.locator(`.drow[data-id="${d.id}"]`)).toBeInViewport()
})

test('the selected deal shows the black "₱{k}k / sqm" tooltip (MAP-003)', async ({ page }) => {
  await open(page)
  await page.locator('#dSearch').fill('b22-l27')
  await expect(page.locator('#listCount')).toHaveText('1 closed deal found')
  await page.locator('.drow').first().click()
  const tip = page.locator('.leaflet-tooltip.seltip')
  await expect(tip).toHaveText('₱37k / sqm')
  await expect(tip).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  await expect(tip).toHaveCSS('color', 'rgb(255, 255, 255)')
})

for (const size of [{ width: 390, height: 844 }, WIDE]) {
  test(`place labels never overlap and are at least 12 px at ${size.width}×${size.height} (R12, MAP-004)`, async ({ page }) => {
    await open(page, size)
    await page.locator('#dealMap').scrollIntoViewIfNeeded()
    await expect(page.locator('.mlab').first()).toBeVisible()
    const boxes = await page.locator('.mlab').evaluateAll((els) => els.map((e) => ({ r: e.getBoundingClientRect().toJSON(), fs: parseFloat(getComputedStyle(e).fontSize) })))
    expect(boxes.length).toBeGreaterThan(1)
    for (const b of boxes) expect(b.fs).toBeGreaterThanOrEqual(12)
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r
        const b = boxes[j].r
        expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, `labels ${i} and ${j} overlap`).toBe(false)
      }
  })
}

test('drop a pin: card "Near Centrio", Escape removes it; outside CDO toasts (MAP-005)', async ({ page }) => {
  await open(page)
  await page.locator('#fLoc').selectOption({ label: 'Centrio' })
  // 300 m south of Centrio's center: its deals are the nearest saved pins, 159 m away.
  const p = await pagePoint(page, 8.478 - 300 / 111_195, 124.647)
  await page.mouse.click(p.x, p.y)
  const card = page.getByRole('dialog', { name: 'New pin' })
  await expect(card).toBeVisible()
  await expect(card.locator('#pinNear')).toHaveText('Near Centrio')
  await expect(card.locator('#pinXY')).toHaveText(/^8\.47\d{3}, 124\.64\d{3}$/)
  await expect(card.getByRole('button', { name: '+ Add a deal here' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await page.mouse.click(p.x, p.y)
  await card.getByRole('button', { name: 'Remove the pin' }).click()
  await expect(card).toHaveCount(0)
  // Outside the CDO bounds.
  await page.locator('#dealMap').evaluate((el) => (el as HTMLElement & { __map: { setView: (c: [number, number], z: number) => void } }).__map.setView([9.1, 124.6], 13))
  const box = (await page.locator('#dealMap').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('#toast')).toHaveText('That spot is outside Cagayan de Oro.')
  await expect(card).toHaveCount(0)
})

test('"+ Add a deal here" starts a deal at the pin, asking first when a draft has text (§7.4.9)', async ({ page }) => {
  await open(page)
  await page.getByRole('link', { name: '+ Add a deal' }).click()
  await page.locator('#aArea').fill('123')
  await page.getByRole('link', { name: 'Closed deals', exact: true }).click()
  await expect(page.locator('#dealMap')).toHaveAttribute('data-markers', '72')
  const p = await pagePoint(page, 8.462, 124.629 - 150 / 110_000) // 150 m west of Pueblo de Oro's center
  await page.mouse.click(p.x, p.y)
  await page.getByRole('button', { name: '+ Add a deal here' }).click()
  const dlg = page.getByRole('dialog', { name: 'Start a new deal at this pin?' })
  await expect(dlg).toContainText('You have an unsaved deal in the add form. Starting here will clear it.')
  await dlg.getByRole('button', { name: 'Start new deal' }).click()
  await expect(page).toHaveURL(/\/deals\/new$/)
  await expect(page.locator('#aPin')).toHaveValue(/^8\.46\d{3}, 124\.62\d{3}$/)
  await expect(page.locator('#aArea')).toHaveValue('')
  await expect(page.locator('#aLoc option:checked')).toHaveText('Pueblo de Oro')
  await expect(page.locator('#aLocHint')).toHaveText('suggested from the pin, change it if wrong')
})

test('wheel zoom stays off until the map is clicked or focused (MAP-006)', async ({ page }) => {
  await open(page, { width: 1280, height: 720 })
  await page.locator('#dealMap').scrollIntoViewIfNeeded()
  const z0 = await zoom(page)
  const box = (await page.locator('#dealMap').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(400)
  expect(await zoom(page)).toBe(z0)
  await page.locator('#dealMap').focus()
  await page.mouse.wheel(0, -400)
  await expect.poll(() => zoom(page)).toBeGreaterThan(z0)
})

test('attribution is visible on the deals map, the pin map and the dialog map (MAP-007)', async ({ page }) => {
  await open(page)
  await expect(page.locator('#dealMap .leaflet-control-attribution')).toContainText('OpenStreetMap contributors')
  await page.goto('/deals/new')
  await expect(page.getByTestId('pinmap').locator('.leaflet-control-attribution')).toContainText('OpenStreetMap contributors')
  await page.goto('/settings')
  await page.getByRole('button', { name: '+ Add subdivision or area' }).click()
  await expect(page.getByRole('dialog').getByTestId('pinmap').locator('.leaflet-control-attribution')).toBeVisible()
})

test('dark mode filters the tiles only (MAP-008)', async ({ page }) => {
  test.skip(!/dark/.test(test.info().project.name), 'dark projects only')
  await open(page)
  const filter = await page.locator('#dealMap .leaflet-tile-pane').evaluate((el) => getComputedStyle(el).filter)
  expect(filter).toContain('invert')
  await page.locator('.drow').first().click()
  await expect(page.locator('.leaflet-tooltip.seltip')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  expect(await page.locator('#dealMap .leaflet-marker-pane').evaluate((el) => getComputedStyle(el).filter)).toBe('none')
})

test('no deals to show: place labels and the map message (§9.2.6)', async ({ page }) => {
  await open(page)
  await page.locator('#fType').selectOption({ label: 'Agricultural lot' })
  await page.locator('#fPeriod').selectOption({ label: 'Last 3 months' })
  await expect(page.locator('.mapmsg')).toHaveText('No closed deals match these filters.')
  await expect(page.locator('.mlab.muted').first()).toBeVisible()
  await page.route('**/api/bootstrap', async (r) => {
    const res = await r.fetch()
    await r.fulfill({ response: res, json: { ...(await res.json()), deals: [] } })
  })
  await page.goto('/deals')
  await expect(page.locator('.mapmsg')).toHaveText('No closed deals yet. Click the map to add one.')
})

test('the Settings place dialog map sets and follows the center (SET-009)', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await page.goto('/settings')
  await page.getByRole('button', { name: '+ Add subdivision or area' }).click()
  const dlg = page.getByRole('dialog', { name: 'Add a subdivision or area' })
  const map = dlg.getByTestId('pinmap')
  await expect(map).toHaveAttribute('aria-label', 'Click to set the map center')
  await expect(map.locator('.leaflet-tile-pane')).toBeAttached()
  await expect(dlg.locator('.mplace span').first()).toBeAttached()
  const box = (await map.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('#nlPin')).toHaveValue(/^8\.\d{5}, 124\.\d{5}$/)
  await expect(map.locator('.pinicon')).toHaveCount(1)
  await page.locator('#nlPin').fill('9.5, 124.6')
  await expect(map.locator('.pinicon')).toHaveCount(0) // outside CDO: no marker
  await page.keyboard.press('Escape')
  // Editing a place opens centered on its center at zoom 16.
  await page.getByRole('button', { name: 'More actions for Centrio' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit Centrio' })
  await expect(edit.getByTestId('pinmap').locator('.pinicon')).toHaveCount(1)
  await expect.poll(() => edit.getByTestId('pinmap').evaluate((el) => (el as HTMLElement & { __map: { getZoom: () => number } }).__map.getZoom())).toBe(16)
})
