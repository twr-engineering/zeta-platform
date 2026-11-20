import type { CollectionConfig } from 'payload'
import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/** Short-form video. 6 published (PRD §2.3). */
export const Shorts: CollectionConfig = {
  slug: 'shorts',
  admin: { useAsTitle: 'title', group: 'Editorial' },
  access: { read: () => true },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    ...slugField(),
    { name: 'videoUrl', type: 'text' },
    { name: 'thumbnail', type: 'upload', relationTo: 'media' },
    { name: 'description', type: 'textarea' },
    seoGroup,
  ],
}
