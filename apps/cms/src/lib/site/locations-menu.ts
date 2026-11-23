/**
 * FR-G01 / FR-G11 — the location menu: cities grouped by island group, each with its child
 * barangays, built from the Locations collection (no hard-coded list). Rendered inside the drawer
 * (WP-03 decision, 23 Nov 2026: the live header is a drawer; the PRD's controls live inside it).
 */
export type MenuLocation = {
  id: number
  name: string
  slug: string
  type: string
  islandGroup?: string | null
  parent?: number | { id: number } | null
  breadcrumbs?: { url?: string | null }[] | null
}

export type LocationGroup = { key: string; label: string; cities: { name: string; href: string; children: { name: string; href: string }[] }[] }

const GROUPS: [string, string][] = [
  ['luzon', 'Luzon'],
  ['visayas', 'Visayas'],
  ['mindanao', 'Mindanao'],
  ['island-destination', 'Island destinations'],
]
const CITY_TYPES = new Set(['city', 'municipality'])

/** `/location/{nested slug path}/` — the frozen WordPress URL form (e.g. /location/cebu-city/cebu-it-park/). */
export function locationHref(l: Pick<MenuLocation, 'slug' | 'breadcrumbs'>): string {
  const path = l.breadcrumbs?.at(-1)?.url || `/${l.slug}`
  return `/location${path.replace(/\/$/, '')}/`
}

const parentId = (l: MenuLocation) => (typeof l.parent === 'object' && l.parent ? l.parent.id : (l.parent ?? null))
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

export function buildLocationMenu(docs: MenuLocation[]): LocationGroup[] {
  const cities = docs.filter((d) => CITY_TYPES.has(d.type) && d.islandGroup)
  return GROUPS.map(([key, label]) => ({
    key,
    label,
    cities: cities
      .filter((c) => c.islandGroup === key)
      .sort(byName)
      .map((c) => ({
        name: c.name,
        href: locationHref(c),
        children: docs
          .filter((d) => d.type === 'barangay' && parentId(d) === c.id)
          .sort(byName)
          .map((b) => ({ name: b.name, href: locationHref(b) })),
      })),
  })).filter((g) => g.cities.length > 0)
}
