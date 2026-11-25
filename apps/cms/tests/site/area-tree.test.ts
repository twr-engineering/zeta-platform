import { describe, expect, it } from 'vitest'

import { buildAreaIndex } from '@/lib/site/area-tree'

// The live API (25 Nov 2026) keys PHP arrays by id when they are not 0..n — municipality_array
// arrived as {"3": {...}} — while the recorded fixture used plain lists. Both must parse.
const live = {
  data: [
    {
      province_id: '4689',
      province_name: 'Misamis Oriental',
      municipality_array: {
        '3': {
          municipality_id: '25956',
          municipality_name: 'Cagayan de Oro City',
          city_array: [
            { city_id: '50410', city_name: 'Patag', complex_array: [] },
            { city_id: '50354', city_name: 'Balulang', complex_array: { '7': { complex_id: '25', complex_name: 'Xavier Estates' } } },
          ],
        },
        '0': { municipality_id: '25960', municipality_name: 'Alubijid', city_array: null },
      },
    },
  ],
}

describe('buildAreaIndex — CRM location tree in both PHP-array shapes', () => {
  it('parses id-keyed objects and lists at every level, sorted like the live picker', () => {
    const index = buildAreaIndex(live)
    expect(index.options.map((o) => o.value)).toEqual(['municipality_25960', 'municipality_25956', 'city_50354', 'complexname_25', 'city_50410'])
    expect(index.town['50410']).toEqual({ name: 'Patag', municipality: 'Cagayan de Oro City' })
    expect(index.complex['25']).toBe('Xavier Estates')
  })
  it('skips entries without an id or a name instead of failing', () => {
    const index = buildAreaIndex({ data: [{ municipality_array: [{ municipality_id: '', municipality_name: 'x' }, { municipality_id: '1', municipality_name: '' }] as never }] })
    expect(index.options).toEqual([])
  })
  it('reads the recorded list-shaped fixture too', () => {
    expect(buildAreaIndex({ data: [{ municipality_array: [{ municipality_id: '9', municipality_name: 'Opol', city_array: [] }] }] }).options).toHaveLength(1)
  })
})
