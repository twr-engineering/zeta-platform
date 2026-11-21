import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'
export type { APIRequestContext, Page } from '@playwright/test'

// A 1×1 transparent PNG for every map tile: tests never fetch OpenStreetMap tiles (its usage
// policy, app PRD §9.1) and pages reach "load" without waiting on the network.
const BLANK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

export const test = base.extend<{ blankTiles: void }>({
  blankTiles: [
    async ({ context }, use) => {
      await context.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: BLANK }))
      await use()
    },
    { auto: true },
  ],
})
