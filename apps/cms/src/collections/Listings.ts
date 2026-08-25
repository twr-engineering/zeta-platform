import type { CollectionConfig } from 'payload'
import { crmOwnedField } from '../fields/slug'
import { seoGroup } from '../fields/seo'

/**
 * Listings — a DURABLE MIRROR of Respacio CRM inventory, not a cache.
 *
 * Architectural note, and the reason this collection exists at all (PRD §15.6):
 * the current WordPress site stores ZERO listings. Every listing page, search
 * result and price is fetched live from https://crm.respacio.com/ws/ on request
 * (CF-01). That makes the CRM a hard runtime dependency and a single point of
 * failure — if it is unreachable, the site has no inventory. The rebuild must not
 * inherit that coupling: the front end reads only from Payload, and the CRM is
 * reached exclusively by the background sync (FR-C07, R-19).
 *
 * Field inventory is MEASURED, not guessed: a properties/view response carries
 * 113 scalar fields plus 24 related collections (PRD DG-02, from the 125 cached
 * detail responses in wp_curl_info). Modelled below is the subset the templates
 * demonstrably render plus the identifiers the sync needs. The remainder is
 * retained verbatim in `crmPayload` so nothing is lost before the full field
 * transcription is complete — see the WP-00 outstanding list, FR-P01/FR-P02.
 *
 * CRM-sourced fields are readOnly in the admin per FR-C03; editorial fields
 * (seo, curation flags) are Payload-owned and must survive every sync.
 */
export const Listings: CollectionConfig = {
  slug: 'listings',
  admin: {
    useAsTitle: 'propertyTitle',
    defaultColumns: ['referenceNo', 'propertyTitle', 'price', 'saleDetailType', 'syncStatus'],
    group: 'Property',
    description: 'Mirrored from Respacio CRM. CRM-owned fields are read-only — edits here are overwritten by the next sync.',
  },
  access: { read: () => true },
  fields: [
    crmOwnedField('CRM property id. Idempotency key for the sync (FR-C01).'),
    {
      name: 'referenceNo',
      type: 'text',
      index: true,
      unique: true,
      admin: { readOnly: true, description: 'e.g. ZTP345. This is the URL identifier — see BPM-007.' },
    },
    { name: 'propertyTitle', type: 'text', admin: { readOnly: true } },
    { name: 'description', type: 'textarea', admin: { readOnly: true } },
    {
      name: 'price',
      type: 'number',
      index: true,
      admin: { readOnly: true, description: 'CRM default_price, in the stored currency. Conversion is display-time only (BPM-008).' },
    },
    { name: 'currencyCode', type: 'text', defaultValue: 'PHP', admin: { readOnly: true } },
    {
      name: 'propertyFor',
      type: 'select',
      index: true,
      options: [
        { label: 'Sale', value: '1' },
        { label: 'Rent', value: '2' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'saleDetailType',
      type: 'select',
      index: true,
      options: [
        { label: 'Resale', value: '1' },
        { label: 'Preselling', value: '2' },
      ],
      admin: { readOnly: true },
    },
    { name: 'subTypeId', type: 'text', index: true, admin: { readOnly: true, description: 'property_sub_type_id — the target of type[]=_st_{n} filters.' } },
    { name: 'bedrooms', type: 'number', admin: { readOnly: true } },
    { name: 'bathrooms', type: 'number', admin: { readOnly: true } },
    { name: 'builtSize', type: 'number', admin: { readOnly: true } },
    { name: 'plotSize', type: 'number', admin: { readOnly: true } },
    { name: 'location', type: 'relationship', relationTo: 'locations', admin: { description: 'Resolved from CRM geography IDs by the sync.' } },
    { name: 'gallery', type: 'array', admin: { readOnly: true }, fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] },
    {
      name: 'crmPayload',
      type: 'json',
      admin: {
        readOnly: true,
        description: 'The full CRM response, retained verbatim. Nothing is discarded before the 113-field transcription is signed off.',
      },
    },
    {
      name: 'syncStatus',
      type: 'select',
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Withdrawn', value: 'withdrawn' },
      ],
      admin: {
        readOnly: true,
        description:
          'Records absent from two consecutive syncs are marked withdrawn, never deleted (FR-C01). What the live site does to a withdrawn URL is FR-P11 — still uncaptured, blocked on OQ-23.',
      },
    },
    { name: 'lastSyncedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
    seoGroup,
  ],
}
