import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { fromListItem, withDetail } from '@zeta/cms-config/respacio/mapper'

const fx = (p: string) => JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/respacio', p), 'utf8'))

describe('Respacio mapper', () => {
  const item = fx('listings.json').find((l: { reference_no: string }) => l.reference_no === 'ZTP345')
  const view = fx('details/ZTP345.json')

  it('maps a list item, resolving the sub-type id from its label', () => {
    const d = fromListItem(item)
    expect(d).toMatchObject({ crmId: '345', referenceNo: 'ZTP345', price: 8_000_000, subTypeName: 'House', subTypeId: '9' })
  })

  it('overlays the detail: CRM geography ids and attribute ids (the fa[] targets)', () => {
    const d = withDetail(fromListItem(item), view)
    expect(d.geo).toMatchObject({ provinceId: '4689', municipalityId: '25956', townId: '50403', complexId: '51' })
    expect(d.saleDetailTypeId).toBe('1')
    expect(d.attributes?.every((a) => /^\d+$/.test(a.crmId))).toBe(true)
  })

  it('fixtures carry no agent contact details or commission splits', () => {
    const pd = view.data.property_details[0]
    for (const k of ['agent_phone', 'agent_email', 'buyer_commission_amount', 'seller_commission_percentage']) {
      expect(pd[k], k).toBe('[redacted]')
    }
  })
})
