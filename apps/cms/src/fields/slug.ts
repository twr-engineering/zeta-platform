import type { Field } from 'payload'

/**
 * Slug + legacyUrls. `legacyUrls` exists because the WordPress site's URL space
 * must survive the replatform (PRD FR-SE01..SE13) — every migrated record carries
 * the paths it used to answer on so the redirect map can be generated, not guessed.
 */
export const slugField = (): Field[] => [
  {
    name: 'slug',
    type: 'text',
    required: true,
    index: true,
    admin: { position: 'sidebar', description: 'URL segment. Frozen for migrated records — changing it breaks a live URL.' },
  },
  {
    name: 'legacyUrls',
    type: 'array',
    admin: {
      position: 'sidebar',
      description: 'Paths this record answered on in WordPress. Drives redirect generation. Do not edit by hand.',
    },
    fields: [{ name: 'path', type: 'text', required: true }],
  },
]

/** Marks a record as owned by the CRM sync rather than by an editor (PRD FR-C03). */
export const crmOwnedField = (description: string): Field => ({
  name: 'crmId',
  type: 'text',
  index: true,
  unique: true,
  admin: { position: 'sidebar', readOnly: true, description },
})
