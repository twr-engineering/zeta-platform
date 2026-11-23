import { describe, expect, it } from 'vitest'

import { buildLocationMenu, locationHref } from '@/lib/site/locations-menu'

// FR-G01: cities grouped by island group with their child barangays, from the Locations collection.
const docs = [
  { id: 1, name: 'Cebu City', slug: 'cebu-city', type: 'city', islandGroup: 'visayas', breadcrumbs: [{ url: '/cebu-city' }] },
  { id: 2, name: 'Cebu IT Park', slug: 'cebu-it-park', type: 'barangay', parent: 1, breadcrumbs: [{ url: '/cebu-city' }, { url: '/cebu-city/cebu-it-park' }] },
  { id: 3, name: 'Cagayan de Oro City', slug: 'cagayan-de-oro-city', type: 'city', islandGroup: 'mindanao', breadcrumbs: [{ url: '/cagayan-de-oro-city' }] },
  { id: 4, name: 'Balulang', slug: 'balulang', type: 'barangay', parent: { id: 3 }, breadcrumbs: [{ url: '/cagayan-de-oro-city' }, { url: '/cagayan-de-oro-city/balulang' }] },
  { id: 5, name: 'Bacolod City', slug: 'bacolod-city', type: 'city', islandGroup: 'visayas' },
  { id: 6, name: 'No group', slug: 'nowhere', type: 'city', islandGroup: null },
  { id: 7, name: 'Xavier Estates', slug: 'xavier-estates', type: 'subdivision', parent: 4 },
]

describe('location menu (FR-G01)', () => {
  it('groups cities by island group in a fixed order and drops empty groups', () => {
    const menu = buildLocationMenu(docs)
    expect(menu.map((g) => g.label)).toEqual(['Visayas', 'Mindanao'])
    expect(menu[0].cities.map((c) => c.name)).toEqual(['Bacolod City', 'Cebu City']) // A–Z
  })
  it('nests barangays under their city; subdivisions and ungrouped cities stay out', () => {
    const [visayas, mindanao] = buildLocationMenu(docs)
    expect(visayas.cities[1].children).toEqual([{ name: 'Cebu IT Park', href: '/location/cebu-city/cebu-it-park/' }])
    expect(mindanao.cities[0].children.map((c) => c.name)).toEqual(['Balulang'])
    expect(JSON.stringify(buildLocationMenu(docs))).not.toContain('Xavier Estates')
    expect(JSON.stringify(buildLocationMenu(docs))).not.toContain('No group')
  })
  it('uses the frozen /location/{path}/ URL form, falling back to the slug', () => {
    expect(locationHref({ slug: 'cebu-city', breadcrumbs: [{ url: '/cebu-city' }] })).toBe('/location/cebu-city/')
    expect(locationHref({ slug: 'bacolod-city' })).toBe('/location/bacolod-city/')
  })
})
