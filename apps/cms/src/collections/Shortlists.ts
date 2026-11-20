import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff, publishedOrStaff } from '../access'

import { slugField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * Shortlists — curated collections. 7 published + 1 draft.
 *
 * CAPTURED RULE — BPM-012 (WP-00-behavioural-parity-matrix.md §2).
 *
 * Every shortlist is rule-based; none is manually curated. The postmeta census
 * was decisive: respacio_location_tree and _respacio_multi_location are empty on
 * all eight records, and there is no member list anywhere. The rule lives in the
 * page body as a URL-encoded query string on the respacio-blocks/search-results
 * block, e.g.
 *
 *   property_for=1&sortby=priority_desc&fa[]=a143      (Foreclosed)
 *   property_for=1&type[]=_st_8                        (Residential Lots)
 *
 * Parameter semantics, from the CRM payload:
 *   property_for=1        Sale
 *   type[]=_st_{n}        property_sub_type_id
 *   fa[]=a{n}             feature / attribute ID
 *   sale_detail_type[]=2  Preselling (1 = Resale)
 *
 * `savedQuery` below preserves that string verbatim so the migration is lossless
 * and the query can be replayed against the CRM adapter without reinterpretation.
 * The structured fields are a decode of it for editor legibility — the raw string
 * remains the source of truth until every shortlist is verified.
 *
 * KNOWN DEFECT CD-13: Beachfront (310626) and Commercial (287902) carry
 * byte-identical queries (type[]=_st_7). One is wrong. The correct sub-type ID
 * for the other is not recoverable from the artefacts — see OQ-22. Do not
 * "fix" this during migration; migrate as-is and let the client decide.
 */
export const Shortlists: CollectionConfig = {
  slug: 'shortlists',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'savedQuery', 'updatedAt'],
    group: 'Property',
  },
  access: { read: publishedOrStaff, create: isStaff, update: isStaff, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    ...slugField(),
    {
      name: 'savedQuery',
      type: 'text',
      required: true,
      admin: {
        description:
          'The CRM query string, verbatim from the WordPress block attribute. Source of truth — the decoded fields below are derived from it.',
      },
    },
    {
      name: 'queryDecoded',
      type: 'group',
      admin: { description: 'Human-readable decode of savedQuery. Advisory only; savedQuery is what executes.' },
      fields: [
        {
          name: 'propertyFor',
          type: 'select',
          options: [
            { label: 'Sale', value: '1' },
            { label: 'Rent', value: '2' },
          ],
        },
        {
          name: 'subTypeIds',
          type: 'array',
          fields: [{ name: 'id', type: 'text' }],
          admin: { description: 'type[]=_st_{n}' },
        },
        {
          name: 'featureIds',
          type: 'array',
          fields: [{ name: 'id', type: 'text' }],
          admin: { description: 'fa[]=a{n}' },
        },
        {
          name: 'saleDetailType',
          type: 'select',
          options: [
            { label: 'Resale', value: '1' },
            { label: 'Preselling', value: '2' },
          ],
        },
        { name: 'minPrice', type: 'number' },
        { name: 'maxPrice', type: 'number' },
        {
          name: 'sortBy',
          type: 'text',
          admin: { description: 'Frozen. See BPM-002 — the operative default is priority_desc.' },
        },
      ],
    },
    {
      name: 'parityNote',
      type: 'textarea',
      admin: {
        description:
          'Records any known defect or open question against this shortlist (e.g. CD-13, CD-14). Migrated, not authored.',
      },
    },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    { name: 'intro', type: 'richText' },
    seoGroup,
  ],
}
