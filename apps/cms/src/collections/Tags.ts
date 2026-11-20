import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff } from '../access'
import { slugField } from '../fields/slug'

/** 50 terms, flat (PRD §2.3). */
export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: { useAsTitle: 'name', group: 'Editorial' },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  fields: [{ name: 'name', type: 'text', required: true }, ...slugField()],
}
