import type { GlobalConfig } from 'payload'
import { isStaff, nobody } from '../access'

/**
 * State the Respacio sync writes and the front end reads.
 *
 * `currencyConverter` is the EUR-based rate table the CRM ships on every response. It is the
 * only FX source the current site has — no third-party provider, no scheduled refresh
 * (BPM-008). The sync stores the latest one so price display never needs the CRM.
 */
export const CrmState: GlobalConfig = {
  slug: 'crm-state',
  admin: { group: 'Settings', description: 'Written by the Respacio sync. Read-only.' },
  // Sync internals (results, errors) are staff-only. The site reads it via the Local API.
  access: { read: isStaff, update: nobody },
  fields: [
    { name: 'currencyConverter', type: 'json', admin: { readOnly: true } },
    {
      name: 'locationTree',
      type: 'json',
      admin: { readOnly: true, description: 'CRM province → municipality → town → complex tree: the search location picker and its name lookups.' },
    },
    {
      name: 'syncCursor',
      type: 'json',
      admin: { readOnly: true, description: 'Where the running sync cycle continues (property_for, offset, CRM ids seen). Empty between cycles.' },
    },
    { name: 'lastStepAt', type: 'date', admin: { readOnly: true, description: 'Last sync step (each cron call runs one).' } },
    { name: 'lastSyncAt', type: 'date', admin: { readOnly: true, description: 'Last completed sync cycle.' } },
    { name: 'lastSyncMode', type: 'text', admin: { readOnly: true, description: 'live or fixtures' } },
    { name: 'lastSyncResult', type: 'json', admin: { readOnly: true } },
  ],
}
