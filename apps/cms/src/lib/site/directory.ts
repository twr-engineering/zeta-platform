import { COMPLEX_BOTTOM, selectDirectory } from '@zeta/parity/directory'

import { payload } from '@/lib/site/payload'
import type { Directory, DirectoryCategory, Media } from '@/payload-types'

export type DirectoryCard = { id: number; name: string; href: string; excerpt: string; image: string | null }
export type DirectoryGridData = { all: DirectoryCard[]; tabs: { slug: string; name: string; cards: DirectoryCard[] }[] }

const card = (d: Directory): DirectoryCard => ({
  id: d.id,
  name: d.name,
  href: `/directory/${d.slug}/`,
  excerpt: d.excerpt ?? '',
  image: d.image && typeof d.image === 'object' ? ((d.image as Media).url ?? null) : null,
})

/**
 * BPM-019 directory grid data for a development page (selection: @zeta/parity/directory). The 25
 * entries are filtered in memory: "none of its categories is excluded" over a hasMany relationship
 * is not one Payload where clause. createdAt carries the WordPress publish date (migrate:wp).
 */
export async function directoryGrid(config = COMPLEX_BOTTOM): Promise<DirectoryGridData> {
  const { docs } = await (await payload()).find({ collection: 'directory', sort: '-createdAt', limit: 500, depth: 1 })
  const entries = (docs as Directory[]).map((d) => ({
    date: d.createdAt,
    categories: (d.categories ?? []).filter((c): c is DirectoryCategory => typeof c === 'object' && !!c).map((c) => ({ slug: c.slug, name: c.name })),
    item: card(d),
  }))
  const r = selectDirectory(entries, config)
  return { all: r.all, tabs: r.tabs.map((t) => ({ slug: t.slug, name: t.name, cards: t.items })) }
}
