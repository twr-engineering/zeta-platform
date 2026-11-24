import { describe, expect, it } from 'vitest'

import { selectDirectory } from '../src/directory'

// The 25 directory posts of the production dump (22 Aug 2026): date, slug, category slugs.
// Names are the live term names; only the ones the grid can show matter.
const NAME: Record<string, string> = { mall: 'Mall', parks: 'Parks', 'public-services': 'Public Services', schools: 'Schools', complex: 'Complex', building: 'Building', shorts: 'Shorts', blogs: 'Blogs', videos: 'Videos', 'lorem-ipsum': 'lorem ipsum' }
const ROWS: [string, string, string[]][] = [
  ['2024-07-01 10:37:46', 'directory-namez', ['mall']],
  ['2024-07-01 10:36:16', 'directory-name-11', ['mall']],
  ['2024-07-01 10:34:55', 'directory-namey', ['mall']],
  ['2024-07-01 10:33:39', 'directory-namex', ['mall']],
  ['2024-06-12 06:33:51', 'economic-development', ['lorem-ipsum']],
  ['2024-02-06 12:43:41', 'directory-name-10', ['parks', 'public-services', 'complex']],
  ['2024-02-06 12:42:00', 'directory-name-9', ['complex']],
  ['2024-02-06 12:41:00', 'directory-name-8', ['complex']],
  ['2024-02-06 12:40:00', 'directory-name-7', ['building']],
  ['2024-02-06 12:39:00', 'directory-name-6', ['building']],
  ['2024-02-06 12:38:00', 'directory-name-5', ['building']],
  ['2024-02-06 12:37:00', 'lorem-ipsum-2', ['lorem-ipsum']],
  ['2024-02-06 12:36:00', 'featured-video-9', ['shorts']],
  ['2024-02-06 12:35:00', 'featured-video-6', ['blogs']],
  ['2024-02-06 12:34:00', 'featured-video-3', ['videos']],
  ['2024-02-02 10:04:00', 'directory-name-4', ['mall']],
  ['2024-02-02 10:03:00', 'directory-name-3', ['public-services']],
  ['2024-02-02 10:02:00', 'directory-name-2', ['schools']],
  ['2024-02-02 10:01:00', 'directory-name', ['parks']],
]
const entries = ROWS.map(([date, slug, cats]) => ({ date, item: slug, categories: cats.map((c) => ({ slug: c, name: NAME[c] ?? c })) }))

describe('BPM-019 directory grid (Complex Bottom)', () => {
  it('drops an entry in any excluded category — 8 survive (matrix worked result)', () => {
    const survivors = selectDirectory(entries, { limit: 100, exclude: ['videos', 'blogs', 'lorem-ipsum', 'lorem-ipsum-2', 'shorts', 'building', 'complex', 'directory1'] }).all
    expect(survivors).toHaveLength(8)
    expect(survivors).not.toContain('directory-name-10') // Parks + Public Services + Complex
  })
  it('shows the newest 6 and tabs All, Mall, Public Services; schools and parks are unreachable', () => {
    const r = selectDirectory(entries)
    expect(r.all).toEqual(['directory-namez', 'directory-name-11', 'directory-namey', 'directory-namex', 'directory-name-4', 'directory-name-3'])
    expect(r.tabs.map((t) => t.name)).toEqual(['Mall', 'Public Services'])
  })
  it('a tab drops the exclusions (CD-20): Public Services includes the Complex-tagged entry', () => {
    const ps = selectDirectory(entries).tabs.find((t) => t.slug === 'public-services')
    expect(ps?.items).toEqual(['directory-name-10', 'directory-name-3'])
  })
})
