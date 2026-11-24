import Link from 'next/link'
import type { Where } from 'payload'

import { HomeBlocks, type HomeData } from '@/components/home/HomeBlocks'
import { pending } from '@/lib/parity/pending'
import { getSiteSettings } from '@/lib/site/settings'
import { payload } from '@/lib/site/payload'
import type { Location, Post, Short } from '@/payload-types'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const settings = await getSiteSettings()
  const page = await findHome()
  return { title: { absolute: page?.seo?.title || settings.siteName || 'Zeta Group' }, description: page?.seo?.description || undefined }
}

async function findHome() {
  const { docs } = await (await payload()).find({ collection: 'pages', where: { slug: { equals: 'home' } }, depth: 2, limit: 1 })
  return docs[0] ?? null
}

/** The front page: the "home" page's blocks (PRD §7.2). */
export default async function HomePage() {
  const page = await findHome()
  if (!page?.layout?.length) {
    return (
      <section>
        <h1>Zeta Group</h1>
        <p>No home page yet: create a page with the slug “home” in the admin, or run <code>pnpm seed:home</code>.</p>
        <p><Link href="/search_results/?property_for=1">Browse properties for sale →</Link></p>
      </section>
    )
  }
  return <HomeBlocks blocks={page.layout} data={await homeData(page.layout)} />
}

async function homeData(layout: NonNullable<Awaited<ReturnType<typeof findHome>>>['layout']): Promise<HomeData> {
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
  return { locationCounts, latestPosts: posts.docs as Post[], latestShorts: shorts.docs as Short[], searchLocations }
}
