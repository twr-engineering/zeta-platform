import type { CollectionConfig } from 'payload'

/**
 * Staff accounts. WordPress had 13 users total — 2 administrators, 1 author,
 * 9 subscribers, 1 with no capabilities (PRD §2.3, measured).
 *
 * Note the public account base is negligible AND the real customer record lives
 * CRM-side: registration is dual-written to contacts/register, and saved searches
 * and saved properties are held by the CRM, not by WordPress. Section 9 must be
 * modelled against the CRM contact, not against this collection.
 *
 * Passwords cannot migrate; a forced reset is required (FR-MG07).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email', group: 'System' },
  auth: true,
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['editor'],
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
    },
  ],
  versions: false,
}
