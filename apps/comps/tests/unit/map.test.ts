import { describe, expect, it } from 'vitest'

import { refKey } from '@/lib/deals'
import { kPerSqm, shadeOf, typeColors } from '@/lib/mapColors'

import { FIXTURE_TYPES, fixtureDeals } from './fixture-deals'

describe('map colors (§9.2.3, §17.4)', () => {
  it('typeColors on the Appendix D set: the 5 most used keep a color, in Settings order', () => {
    const tc = typeColors(fixtureDeals(), FIXTURE_TYPES)
    const key = (n: string) => refKey(FIXTURE_TYPES.find((t) => t.name === n)!)
    expect(['Residential lot', 'House and lot', 'Commercial lot', 'Condo unit', 'Beach lot'].map((n) => tc.color(key(n)))).toEqual(['--c1', '--c2', '--c3', '--c4', '--c5'])
    for (const n of ['Townhouse', 'Commercial building', 'Condotel unit', 'Warehouse', 'Industrial lot', 'Agricultural lot', 'Office unit']) expect(tc.color(key(n))).toBe('--muted')
    expect(tc.color('name:Duplex')).toBe('--muted')
    expect(tc.colored).toHaveLength(5)
  })
  it('six or fewer types each keep a color', () => {
    const deals = fixtureDeals().filter((d) => ['Residential lot', 'Condo unit', 'Townhouse'].includes(d.type.name))
    const tc = typeColors(deals, FIXTURE_TYPES)
    expect(tc.colored.map((k) => tc.color(k))).toEqual(['--c1', '--c2', '--c3'])
  })
  it('shade steps for 5 sorted values (§17.4)', () => {
    const v = [10, 20, 30, 40, 50]
    expect(v.map((x) => shadeOf(x, v))).toEqual(['--s1', '--s2', '--s3', '--s4', '--s5'])
    expect(shadeOf(7, [7])).toBe('--s1')
  })
  it('selected tooltip text (MAP-003)', () => expect(kPerSqm(26_451)).toBe('₱26k / sqm'))
})
