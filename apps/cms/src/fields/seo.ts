import type { Field } from 'payload'

/**
 * Yoast carried 424 indexable records and per-record title/metadesc overrides.
 * Those values migrate into this group so no page silently loses its metadata.
 */
export const seoGroup: Field = {
  name: 'seo',
  type: 'group',
  admin: { description: 'Migrated from Yoast. Empty fields fall back to the record title and excerpt.' },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'description', type: 'textarea' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    {
      name: 'noindex',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Set only with SEO sign-off — this removes the page from search results.' },
    },
  ],
}
