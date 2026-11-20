import type { GlobalConfig } from 'payload'
import { anyone, isAdmin } from '../access'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  admin: { group: 'Settings' },
  access: { read: anyone, update: isAdmin },
  fields: [
    { name: 'siteName', type: 'text', defaultValue: 'Zeta Group' },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'brokerLicence', type: 'text', admin: { description: 'PRC Broker Lic. No. — required on public pages.' } },
    { name: 'officeAddress', type: 'textarea' },
    { name: 'phone', type: 'text' },
    { name: 'email', type: 'email' },
    {
      name: 'social',
      type: 'group',
      fields: [
        { name: 'facebook', type: 'text' },
        { name: 'tiktok', type: 'text' },
        { name: 'youtube', type: 'text' },
        { name: 'instagram', type: 'text' },
        { name: 'linkedin', type: 'text' },
      ],
    },
  ],
}
