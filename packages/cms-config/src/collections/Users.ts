import type { CollectionConfig } from 'payload'
import { adminFieldOnly, adminOrSelf, canUseAdminPanel, isAdmin } from '../access'

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
  // Lockout and session length serve every staff login, CMS and Comps alike: 5 failed tries
  // locks the account for 15 minutes (Comps AUTH-004); sessions last 30 days (AUTH-003).
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 30 * 24 * 60 * 60,
  },
  // Was read: () => true, which exposed every staff email and role through the public API.
  access: { read: adminOrSelf, create: isAdmin, update: adminOrSelf, delete: isAdmin, admin: canUseAdminPanel },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['editor'],
      // Without this, any user could PATCH their own roles to ['admin'].
      access: { create: adminFieldOnly, update: adminFieldOnly },
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        // Zeta Comps only: full access to Comps, no CMS admin panel (client-apps/comps.md C4).
        { label: 'Comps admin', value: 'comps-admin' },
      ],
    },
  ],
  versions: false,
}
