import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, publishedOrStaff } from '../access'
import { HOME_BLOCKS } from '../blocks/home'
import { PAGE_BLOCKS } from '../blocks/page'
import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * 22 pages (PRD Appendix C, full slug list there).
 *
 * Bodies are UAGB layouts in WordPress (the Buy page is 63 KB across 102 uagb/container
 * blocks). `pnpm migrate:wp --only=pages` recomposes the content pages into the home and page
 * block libraries section by section (PRD §16.1, R-21); editors refine them from there.
 * App-rendered pages (search, listings, locations, shortlists, insights, account) are routes,
 * not page records.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title', group: 'Content' },
  access: { read: publishedOrStaff, create: isStaff, update: isStaff, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    ...slugField(),
    {
      name: 'layout',
      type: 'blocks',
      blocks: [...HOME_BLOCKS, ...PAGE_BLOCKS],
      admin: { description: 'Sections in order; drag to reorder (FR-H01, FR-H10). The page with slug "home" is the front page.' },
    },
    { name: 'content', type: 'richText' },
    seoGroup,
  ],
}
