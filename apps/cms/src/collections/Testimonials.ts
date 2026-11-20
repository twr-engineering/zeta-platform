import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff, publishedOrStaff } from '../access'
import { slugField } from '../fields/slug'

/** 5 published, categorised Buyers (4) / Sellers (1) (PRD §2.3). */
export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  admin: { useAsTitle: 'clientName', group: 'Content' },
  access: { read: publishedOrStaff, create: isStaff, update: isStaff, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: 'clientName', type: 'text', required: true },
    ...slugField(),
    { name: 'quote', type: 'textarea', required: true },
    { name: 'category', type: 'relationship', relationTo: 'testimonial-categories' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
  ],
}

/** 2 terms: Buyers, Sellers. WordPress also had a testimonial-tag taxonomy (1 term). */
export const TestimonialCategories: CollectionConfig = {
  slug: 'testimonial-categories',
  admin: { useAsTitle: 'name', group: 'Content' },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  fields: [{ name: 'name', type: 'text', required: true }, ...slugField()],
}
