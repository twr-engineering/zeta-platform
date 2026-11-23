import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, publishedOrStaff } from '../access'
import { HOME_BLOCKS } from '../blocks/home'
import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * 22 pages (PRD Appendix C, full slug list there).
 *
 * Bodies are UAGB-heavy in WordPress — the Buy page alone is 63 KB across 102
 * uagb/container blocks — so migration is per-page manual re-composition, not
 * scripted (PRD §16.1, R-21). `content` is intentionally richText for now; the
 * block library (§13.4) cannot be frozen until the Respacio template DSL is
 * catalogued (BPM-011).
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
      blocks: HOME_BLOCKS,
      admin: { description: 'Sections in order; drag to reorder (FR-H01, FR-H10). The page with slug "home" is the front page.' },
    },
    { name: 'content', type: 'richText' },
    seoGroup,
  ],
}
