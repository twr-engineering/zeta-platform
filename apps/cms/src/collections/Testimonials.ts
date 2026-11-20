import type { CollectionConfig } from 'payload'
import { slugField } from '../fields/slug'

/** 5 published, categorised Buyers (4) / Sellers (1) (PRD §2.3). */
export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  admin: { useAsTitle: 'clientName', group: 'Content' },
  access: { read: () => true },
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
  access: { read: () => true },
  fields: [{ name: 'name', type: 'text', required: true }, ...slugField()],
}
