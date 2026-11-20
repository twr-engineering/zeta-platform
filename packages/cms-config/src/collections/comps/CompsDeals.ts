import type { CollectionConfig } from 'payload'

import { compsTrashOrAdminDelete, isCompsStaff } from '../../access'
import { auditFields, stampAudit } from './audit'

/**
 * Zeta Comps: closed (sold) deals (app PRD §13.2 `deals`).
 *
 * - Soft delete is Payload trash (`deletedAt`), so the app's Undo restores the same row (C19).
 * - Money is whole pesos in `number` fields, exact in JS up to 2^53 (ADR-8 amendment;
 *   fractional money is still never stored this way).
 * - `dateSold` is an ISO calendar date string (YYYY-MM-DD), not a timestamp: every date rule
 *   is Asia/Manila (NFR-006) and a timestamptz would shift days across the UTC boundary.
 * - Range, enum, exactly-one-of and duplicate-check rules are also database checks in the
 *   comps migration (DATA-001). The full ordered validation with UI messages (§8.6.3) runs
 *   in apps/comps, browser and server.
 */
const select = (name: string, values: string[]) =>
  ({ name, type: 'select', options: values.map((v) => ({ label: v, value: v })) }) as const

export const CompsDeals: CollectionConfig = {
  slug: 'comps-deals',
  labels: { singular: 'Closed deal', plural: 'Closed deals' },
  admin: { group: 'Zeta Comps', useAsTitle: 'details', defaultColumns: ['location', 'propertyType', 'details', 'price', 'dateSold'] },
  access: { read: isCompsStaff, create: isCompsStaff, update: isCompsStaff, delete: compsTrashOrAdminDelete },
  trash: true,
  defaultSort: '-dateSold',
  hooks: { beforeChange: [stampAudit] },
  fields: [
    // Exactly one of location / legacyLocationName, and of propertyType / legacyTypeName (§13.4).
    { name: 'location', type: 'relationship', relationTo: 'comps-locations', index: true },
    { name: 'legacyLocationName', type: 'text' },
    { name: 'propertyType', type: 'relationship', relationTo: 'comps-property-types', index: true },
    { name: 'legacyTypeName', type: 'text' },

    { name: 'area', type: 'number', required: true, min: 10, max: 1_000_000 },
    { name: 'lotArea', type: 'number', min: 10, max: 1_000_000 },
    { name: 'price', type: 'number', required: true, min: 1 },
    { name: 'dateSold', type: 'text', required: true, index: true },
    { name: 'lat', type: 'number', required: true, min: 8.2, max: 8.8 },
    { name: 'lng', type: 'number', required: true, min: 124.3, max: 125.0 },

    { name: 'details', type: 'text', maxLength: 40 },
    { name: 'code', type: 'text', maxLength: 400 },
    { name: 'link', type: 'text', maxLength: 400 },
    { name: 'note', type: 'text', maxLength: 300 },

    // Lots
    { name: 'frontage', type: 'number', min: 1, max: 2000 },
    { name: 'corner', type: 'checkbox', required: true, defaultValue: false },
    select('view', ['Ridge view']),
    select('terrain', ['Flat', 'Sloped', 'Irregular']),
    // Houses and buildings
    select('cond', ['Brand new', 'Good', 'Needs repair']),
    { name: 'yearBuilt', type: 'number', min: 1900, max: 2100 },
    { name: 'storeys', type: 'number', min: 1, max: 4 },
    // Condos
    { name: 'floor', type: 'number', min: 1, max: 100 },
    select('furn', ['Furnished', 'Semi-furnished', 'Unfurnished']),
    select('parkIncl', ['Included', 'Separate']),
    // Rooms and parking
    { name: 'beds', type: 'number', min: 0, max: 5 },
    { name: 'baths', type: 'number', min: 1, max: 5 },
    { name: 'parking', type: 'number', min: 0, max: 3 },
    // Sale
    select('fin', ['Cash', 'Bank loan', 'Pag-IBIG', 'In-house or developer financing', 'Other']),
    { name: 'asking', type: 'number', min: 1 },
    { name: 'dom', type: 'number', min: 0, max: 3650 },

    ...auditFields(true),
  ],
}
