import type { GlobalConfig } from 'payload'

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
  access: { read: () => true, update: () => false },
  fields: [
    { name: 'currencyConverter', type: 'json', admin: { readOnly: true } },
    { name: 'lastSyncAt', type: 'date', admin: { readOnly: true } },
    { name: 'lastSyncMode', type: 'text', admin: { readOnly: true, description: 'live or fixtures' } },
    { name: 'lastSyncResult', type: 'json', admin: { readOnly: true } },
  ],
}
