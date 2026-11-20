import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff } from '../access'
import { slugField } from '../fields/slug'

/**
 * 8 terms, nested one level (PRD §2.3).
 *
 * Includes `real-estate-news` with ZERO posts. Per GP.3 item 4 the taxonomy shape
 * is frozen, including empty entries — removing it is a deviation, not tidying.
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: { useAsTitle: 'name', group: 'Editorial' },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  fields: [
    { name: 'name', type: 'text', required: true },
    ...slugField(),
    { name: 'parent', type: 'relationship', relationTo: 'categories' },
    { name: 'description', type: 'textarea' },
  ],
}
