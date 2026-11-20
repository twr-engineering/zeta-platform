import config from '@payload-config'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

// Tier 1 smoke test: the Comps process boots Payload from the shared config against the CMS
// database and reaches its collections through the Local API.
describe('comps Local API', () => {
  it('boots Payload and queries comps collections', async () => {
    const payload = await getPayload({ config })
    const types = await payload.count({ collection: 'comps-property-types', overrideAccess: true })
    const deals = await payload.count({ collection: 'comps-deals', overrideAccess: true })
    expect(types.totalDocs).toBeGreaterThanOrEqual(0)
    expect(deals.totalDocs).toBeGreaterThanOrEqual(0)
  })

  it('applies collection access for an anonymous caller', async () => {
    const payload = await getPayload({ config })
    await expect(payload.find({ collection: 'comps-deals', overrideAccess: false })).rejects.toThrow()
  })
})
