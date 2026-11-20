import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff } from '../access'

/**
 * Media.
 *
 * Two distinct populations land here (PRD §16.1):
 *   - 287 WordPress library attachments, copied from site/wp-content/uploads/
 *   - 10,632 distinct CRM property images, recovered from the local imgproxy
 *     cache. Filenames there are base64-encoded CRM paths with ---{w}x{h}@{n}x
 *     rendition suffixes; the ingest decodes them, discards the variants, and
 *     keeps one original per image keyed by `crmPath` so listings can bind to it.
 *
 * `alt` is required because FR-M05 requires it, but a large share of migrated
 * records will arrive without one — the migration flags those for editorial
 * rather than inventing alt text.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  admin: { group: 'System' },
  fields: [
    {
      name: 'alt',
      type: 'text',
      admin: { description: 'Required for new uploads. Migrated records missing this are flagged, not auto-filled.' },
    },
    {
      name: 'crmPath',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description: 'Decoded CRM attachment path, e.g. property_attachment/detail_image/... Set by the media ingest.',
      },
    },
    {
      name: 'needsAltText',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Set by the migration when the source had no alt text.' },
    },
  ],
  upload: true,
}
