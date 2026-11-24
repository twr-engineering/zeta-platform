import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff, publishedOrStaff } from '../access'
import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * 25 entries across 12 categories (PRD §2.3). An entry can sit in several categories, and the
 * directory grid's exclusions test every one of them (BPM-019: an entry in Parks + Complex is
 * excluded by "!Complex"). Pages live at /directory/{slug}/.
 */
export const DirectoryEntries: CollectionConfig = {
  slug: 'directory',
  admin: { useAsTitle: 'name', group: 'Content' },
  access: { read: publishedOrStaff, create: isStaff, update: isStaff, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: 'name', type: 'text', required: true },
    ...slugField(),
    { name: 'categories', type: 'relationship', relationTo: 'directory-categories', hasMany: true },
    { name: 'excerpt', type: 'textarea', admin: { description: 'The card text in directory grids.' } },
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
