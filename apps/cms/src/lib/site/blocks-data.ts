import type { Where } from 'payload'

import type { HomeData } from '@/components/home/HomeBlocks'
import { DEFAULT_INCOME_MULTIPLE } from '@/lib/calculator'
import { pending } from '@/lib/parity/pending'
import { payload } from '@/lib/site/payload'
import type { Location, Page, Post, Short } from '@/payload-types'

/** What the layout's blocks need from the database: city counts, latest content, hero picker, calculator default. */
export async function blocksData(layout: Page['layout']): Promise<HomeData> {
  const p = await payload()
  const featured = (layout ?? []).flatMap((b) => (b.blockType === 'homeLocations' ? (b.locations ?? []) : [])).filter((l): l is Location => typeof l === 'object' && !!l)

  // FR-H06 listing counts: by the location's CRM ids when bound, else by its CRM municipality name.
  const locationCounts: Record<number, number> = {}
  await Promise.all(
    featured.map(async (l) => {
      const g = l.crmGeography
      const nameMatch: Where = { 'geo.municipalityName': { like: l.name.replace(/ City$/i, '') } }
      const idMatch: Where | null = g?.townId ? { 'geo.townId': { equals: g.townId } } : g?.municipalityId ? { 'geo.municipalityId': { equals: g.municipalityId } } : null
      pending('location-counts')
      const geo: Where = idMatch ? { or: [idMatch, nameMatch] } : nameMatch
      const { totalDocs } = await p.count({ collection: 'listings', where: { and: [{ syncStatus: { equals: 'active' } }, { propertyForId: { equals: '1' } }, geo] } })
      locationCounts[l.id] = totalDocs
    }),
  )

  const [posts, shorts, locs] = await Promise.all([
    p.find({ collection: 'posts', sort: '-publishedAt', limit: 8, depth: 1 }),
    p.find({ collection: 'shorts', sort: '-createdAt', limit: 4, depth: 1 }),
    p.find({ collection: 'locations', where: { or: [{ 'crmGeography.municipalityId': { exists: true } }, { 'crmGeography.townId': { exists: true } }] }, sort: 'name', limit: 300, depth: 0 }),
  ])
  // Hero picker: locations bound to CRM geography → area[] values the search parses (BPM-004).
  const searchLocations = locs.docs.flatMap((l) => {
    const g = l.crmGeography
    if (g?.townId) return [{ label: l.name, value: `city_${g.townId}` }]
    if (g?.municipalityId) return [{ label: l.name, value: `municipality_${g.municipalityId}` }]
    return []
  })
  const incomeMultiple = (layout ?? []).some((b) => b.blockType === 'calculator')
    ? ((await p.findGlobal({ slug: 'calculator-defaults', depth: 0 })).incomeMultiple ?? DEFAULT_INCOME_MULTIPLE)
    : DEFAULT_INCOME_MULTIPLE
  return { locationCounts, latestPosts: posts.docs as Post[], latestShorts: shorts.docs as Short[], searchLocations, incomeMultiple }
}
