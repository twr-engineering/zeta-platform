import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, publishedOrStaff } from '../access'
import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * Insights articles. 69 published (PRD §2.3, measured).
 *
 * Permalink is flat `/{slug}/` — WordPress permalink_structure is /%postname%/,
 * which closed OQ-01. Pagination is 6/page across 12 pages (BPM-013, verified live).
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'category', 'publishedAt'], group: 'Editorial' },
  access: { read: publishedOrStaff, create: isStaff, update: isStaff, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    ...slugField(),
    { name: 'excerpt', type: 'textarea' },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    { name: 'content', type: 'richText' },
    { name: 'category', type: 'relationship', relationTo: 'categories' },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    {
      // _respacio_multi_location ("{province:4689|municipality:25956|city:52767},…"): location pages
      // list a post in "More About …" when this holds their CRM level and id (meta LIKE, BPM-017).
      name: 'crmLocationTree',
      type: 'text',
      admin: { readOnly: true, position: 'sidebar', description: 'CRM locations this post is about (from WordPress).' },
    },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
    seoGroup,
  ],
}
