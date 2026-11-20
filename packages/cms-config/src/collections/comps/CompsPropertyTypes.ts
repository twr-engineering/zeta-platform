import type { CollectionConfig } from 'payload'

import { isCompsStaff } from '../../access'
import { auditFields, stampAudit } from './audit'

/**
 * Zeta Comps: Settings "Property types" (app PRD §13.2 `property_types`, §7.5.6).
 * `form` decides what "per sqm" means (lot / floor / unit area) and is locked while any
 * non-deleted deal uses the type: enforced in the apps/comps API (409).
 */
export const CompsPropertyTypes: CollectionConfig = {
  slug: 'comps-property-types',
  labels: { singular: 'Property type', plural: 'Property types' },
  admin: { group: 'Zeta Comps', useAsTitle: 'name', defaultColumns: ['name', 'form', 'category', 'hidden', 'sortOrder'] },
  access: { read: isCompsStaff, create: isCompsStaff, update: isCompsStaff, delete: isCompsStaff },
  defaultSort: 'sortOrder',
  hooks: { beforeChange: [stampAudit] },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 40 },
    {
      name: 'form',
      type: 'select',
      required: true,
      defaultValue: 'lot',
      options: [
        { label: 'Lot area', value: 'lot' },
        { label: 'Floor area', value: 'house' },
        { label: 'Unit floor area', value: 'condo' },
      ],
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'Residential',
      options: ['Residential', 'Commercial', 'Industrial', 'Agricultural'],
    },
    { name: 'hidden', type: 'checkbox', required: true, defaultValue: false },
    { name: 'sortOrder', type: 'number', required: true, index: true },
    ...auditFields(),
  ],
}
