/**
 * BPM-019 — directory grid selection. CAPTURED from respacio blocks/infinity-directory-grid,
 * includes/functions.php:2042–2786 and dynamicsection 308024 ("Complex Bottom"). Do not "improve".
 *
 * Published entries, newest first, `limit` per grid. `post_tax` "directory-category|!A,!B" is one
 * NOT IN on category slugs: an entry in any excluded category is dropped. Tabs are "All" plus the
 * categories present on the first page, by name ASC. A tab replaces the whole taxonomy query with
 * its one slug, so the exclusions no longer apply (CD-20). No paging.
 */
export type DirectoryEntry<T = unknown> = { date: string; categories: { slug: string; name: string }[]; item: T }
export type DirectorySelection<T> = { all: T[]; tabs: { slug: string; name: string; items: T[] }[] }

/** "Complex Bottom" (308024): the only visible directory grid, on every development page. */
export const COMPLEX_BOTTOM = {
  limit: 6,
  exclude: ['videos', 'blogs', 'lorem-ipsum', 'lorem-ipsum-2', 'shorts', 'building', 'complex', 'directory1'],
} as const

export function selectDirectory<T>(entries: DirectoryEntry<T>[], config: { limit: number; exclude: readonly string[] } = COMPLEX_BOTTOM): DirectorySelection<T> {
  const newest = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  const page1 = newest.filter((e) => !e.categories.some((c) => config.exclude.includes(c.slug))).slice(0, config.limit)
  const present = new Map<string, string>()
  for (const e of page1) for (const c of e.categories) present.set(c.slug, c.name)
  const tabs = [...present.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([slug, name]) => ({ slug, name, items: newest.filter((e) => e.categories.some((c) => c.slug === slug)).slice(0, config.limit).map((e) => e.item) }))
  return { all: page1.map((e) => e.item), tabs }
}
