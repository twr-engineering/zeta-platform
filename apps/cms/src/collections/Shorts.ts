import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, publishedOrStaff } from '../access'
import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/** Short-form video. 6 published (PRD §2.3). */
export const Shorts: CollectionConfig = {
  slug: 'shorts',
  admin: { useAsTitle: 'title', group: 'Editorial' },
  access: { read: publishedOrStaff, create: isStaff, update: isStaff, delete: isAdmin },
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
