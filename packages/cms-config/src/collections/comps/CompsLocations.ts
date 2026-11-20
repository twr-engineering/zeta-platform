import type { CollectionConfig } from 'payload'

import { isCompsStaff } from '../../access'
import { auditFields, stampAudit } from './audit'

/**
 * Zeta Comps: Settings "Subdivisions and areas" (app PRD §13.2 `locations`, §7.5).
 * Names are unique ignoring case, and lat/lng must sit inside Cagayan de Oro: both are also
 * enforced by database checks in the comps migration. App-level rules (at least one shown,
 * delete refused while used, exact UI messages) live in apps/comps.
 */
export const CompsLocations: CollectionConfig = {
  slug: 'comps-locations',
  labels: { singular: 'Subdivision or area', plural: 'Subdivisions and areas' },
  admin: { group: 'Zeta Comps', useAsTitle: 'name', defaultColumns: ['name', 'kind', 'hidden', 'sortOrder'] },
  access: { read: isCompsStaff, create: isCompsStaff, update: isCompsStaff, delete: isCompsStaff },
  defaultSort: 'sortOrder',
  hooks: { beforeChange: [stampAudit] },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 60 },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'Subdivision',
      // 'Zone' is shown as "Area" everywhere in the UI (app PRD glossary).
      options: [
        { label: 'Subdivision', value: 'Subdivision' },
        { label: 'Area', value: 'Zone' },
      ],
    },
    { name: 'lat', type: 'number', required: true, min: 8.2, max: 8.8 },
    { name: 'lng', type: 'number', required: true, min: 124.3, max: 125.0 },
    { name: 'hidden', type: 'checkbox', required: true, defaultValue: false },
    { name: 'sortOrder', type: 'number', required: true, index: true },
    ...auditFields(),
  ],
}
