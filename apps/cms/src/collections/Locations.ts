import type { CollectionConfig } from 'payload'

import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * Locations — the SEO backbone of the site.
 *
 * 152 published records in WordPress, 25 top-level, 47 distinct parents
 * (PRD §2.3, measured from the dump). Hierarchy is handled by
 * @payloadcms/plugin-nested-docs, configured in payload.config.ts.
 *
 * The `crmGeography` group is the load-bearing part. In WordPress this lived in
 * `respacio_location_tree` postmeta (472 rows) and is what lets a location page
 * list inventory at all — it binds the editorial location record to the CRM's
 * own province / municipality / town / complex IDs. Without it a location page
 * is just prose. See PRD §16.1 and BPM-012.
 */
export const Locations: CollectionConfig = {
  slug: 'locations',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'parent', 'updatedAt'],
    group: 'Property',
  },
  access: { read: () => true },
  versions: { drafts: true },
  fields: [
    { name: 'name', type: 'text', required: true },
    ...slugField(),
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'city',
      options: [
        { label: 'Region', value: 'region' },
        { label: 'Province', value: 'province' },
        { label: 'City', value: 'city' },
        { label: 'Municipality', value: 'municipality' },
        { label: 'Barangay', value: 'barangay' },
        { label: 'Subdivision / Development', value: 'subdivision' },
      ],
    },
    {
      name: 'islandGroup',
      type: 'select',
      options: [
        { label: 'Luzon', value: 'luzon' },
        { label: 'Visayas', value: 'visayas' },
        { label: 'Mindanao', value: 'mindanao' },
        { label: 'Island destination', value: 'island-destination' },
      ],
    },
    {
      name: 'crmGeography',
      type: 'group',
      admin: {
        description:
          'Binds this page to CRM inventory. Migrated from respacio_location_tree. If these are empty the page cannot list properties.',
      },
      fields: [
        { name: 'provinceId', type: 'text', index: true },
        { name: 'municipalityId', type: 'text', index: true },
        { name: 'townId', type: 'text', index: true },
        { name: 'complexId', type: 'text', index: true },
        {
          name: 'complexName',
          type: 'text',
          admin: { description: 'CRM complex_name, kept for reconciliation against the sync.' },
        },
      ],
    },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    { name: 'intro', type: 'richText', admin: { description: 'Above the listing modules.' } },
    { name: 'content', type: 'richText', admin: { description: 'Long-form SEO copy below the listing modules.' } },
    /**
     * Deliberately NOT Payload's `point` type.
     *
     * `point` compiles to a PostGIS `geometry` column, which would make PostGIS a
     * hard requirement of every environment — including whichever host OQ-06
     * eventually picks — in order to serve a field that is optional at launch and
     * only actually needed by the Phase 2 map (P2-01).
     *
     * Two plain numbers cost nothing now and carry the same data. If Phase 2 wants
     * real geo queries (radius search, bounding box), revisit then: adding PostGIS
     * and backfilling a geometry column from these two values is a contained
     * migration, whereas unpicking a platform-wide PostGIS dependency is not.
     */
    {
      name: 'coordinates',
      type: 'group',
      admin: { description: 'Optional at launch; required for the Phase 2 map (P2-01).' },
      fields: [
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
      ],
    },
    {
      name: 'relatedPosts',
      type: 'relationship',
      relationTo: 'posts',
      hasMany: true,
    },
    seoGroup,
  ],
}
