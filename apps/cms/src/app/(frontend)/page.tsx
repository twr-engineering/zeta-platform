import Link from 'next/link'

import { HomeBlocks } from '@/components/home/HomeBlocks'
import { blocksData } from '@/lib/site/blocks-data'
import { getSiteSettings } from '@/lib/site/settings'
import { payload } from '@/lib/site/payload'

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
  return <HomeBlocks blocks={page.layout} data={await blocksData(page.layout)} />
}
