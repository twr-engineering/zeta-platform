import { getAreaIndex } from '@/lib/site/area-options'
import { locationHref } from '@/lib/site/locations-menu'
import { payload } from '@/lib/site/payload'
import type { Location } from '@/payload-types'

/**
 * BPM-017 "Explore Areas in {city}" ([location_list] from the CRM location tree): three columns —
 * Neighborhoods (the city's barangays), Developments (its complexes, strcmp order) and Preselling
 * (its new developments, title DESC, capped at 9) — each "Name (count)". Barangay pages show the
 * same lists for their city. Live links every name to /location/{city}/{slug} even when no page
 * exists; here a name links only when the location page exists.
 */
export type ExploreItem = { name: string; count: number; href: string | null; active?: boolean }
export type Explore = { neighborhoods: ExploreItem[]; developments: ExploreItem[]; preselling: ExploreItem[] }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export async function locationExplore(city: Location, activeId?: number): Promise<Explore> {
  const p = await payload()
  const index = await getAreaIndex()
  const cityName = norm(city.crmGeography?.municipalityId ? index.municipality[city.crmGeography.municipalityId] : city.name)
  const towns = Object.entries(index.town).filter(([, t]) => norm(t.municipality) === cityName || norm(t.municipality) === norm(city.name))
  const townIds = new Set(towns.map(([id]) => id))
  const complexes = index.options.filter((o) => o.level === 'development' && o.parent && townIds.has(o.parent.replace('city_', '')))

  // Counts: active sale listings, by id or by name (list payloads rarely carry ids; pending location-counts).
  const { docs: listings } = await p.find({
    collection: 'listings',
    where: { and: [{ syncStatus: { equals: 'active' } }, { propertyForId: { equals: '1' } }] },
    pagination: false,
    depth: 0,
    select: { geo: true },
  })
  const inCity = listings.filter((l) => norm(l.geo?.municipalityName) === cityName || norm(l.geo?.municipalityName) === norm(city.name))
  const townCount = (id: string, name: string) => inCity.filter((l) => l.geo?.townId === id || norm(l.geo?.cityName) === norm(name)).length
  const complexCount = (id: string, name: string) => inCity.filter((l) => l.geo?.complexId === id || norm(l.geo?.complexName) === norm(name)).length

  // Location pages under this city, to link names that have one.
  const { docs: pages } = await p.find({ collection: 'locations', where: { id: { not_equals: city.id } }, pagination: false, depth: 0, select: { name: true, slug: true, parent: true, type: true, breadcrumbs: true, newDevelopment: true, legacyUrls: true, crmGeography: true } })
  const under = (pages as Location[]).filter((l) => (l.breadcrumbs ?? []).some((b) => b.doc === city.id || (typeof b.doc === 'object' && b.doc?.id === city.id)))
  const pageFor = (name: string, type: Location['type']) => under.find((l) => l.type === type && norm(l.name) === norm(name)) ?? null

  const neighborhoods = towns
    .map(([id, t]) => {
      const page = pageFor(t.name, 'barangay')
      return { name: t.name, count: townCount(id, t.name), href: page ? locationHref(page) : null, active: !!page && page.id === activeId }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const developments = complexes
    .map((o) => {
      const id = o.value.replace('complexname_', '')
      const page = pageFor(o.label, 'subdivision')
      return { name: o.label, count: complexCount(id, o.label), href: page ? locationHref(page) : null, active: !!page && page.id === activeId }
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const preselling = under
    .filter((l) => l.newDevelopment)
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 9)
    .map((l) => ({ name: l.name, count: complexCount(l.crmGeography?.complexId ?? '', l.name), href: locationHref(l), active: l.id === activeId }))
  return { neighborhoods, developments, preselling }
}
