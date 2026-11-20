import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff, publishedOrStaff } from '../access'
import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * 25 entries across 12 categories (PRD §2.3).
 * Filter semantics (FR-E20) are NOT yet captured — see the WP-00 outstanding list.
 */
export const DirectoryEntries: CollectionConfig = {
  slug: 'directory',
  admin: { useAsTitle: 'name', group: 'Content' },
  access: { read: publishedOrStaff, create: isStaff, update: isStaff, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: 'name', type: 'text', required: true },
    ...slugField(),
    { name: 'category', type: 'relationship', relationTo: 'directory-categories' },
    { name: 'location', type: 'relationship', relationTo: 'locations' },
    { name: 'description', type: 'richText' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    seoGroup,
  ],
}

/** 12 terms. Two are placeholders (lorem-ipsum, lo) and two are empty (Directory1, lo). */
export const DirectoryCategories: CollectionConfig = {
  slug: 'directory-categories',
  admin: { useAsTitle: 'name', group: 'Content' },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  fields: [{ name: 'name', type: 'text', required: true }, ...slugField()],
}
