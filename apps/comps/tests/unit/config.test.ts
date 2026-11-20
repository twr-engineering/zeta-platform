import config from '@payload-config'
import { describe, expect, it } from 'vitest'

// Comps loads the same Payload config as the CMS: its collections must be there, and it must
// not try to serve the admin panel.
describe('comps payload config', () => {
  it('includes the comps collections', async () => {
    const slugs = (await config).collections.map((c) => c.slug)
    expect(slugs).toEqual(expect.arrayContaining(['comps-locations', 'comps-property-types', 'comps-deals', 'users']))
  })
})
