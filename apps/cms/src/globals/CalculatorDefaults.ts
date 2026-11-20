import type { GlobalConfig } from 'payload'
import { anyone, isAdmin } from '../access'

/**
 * FR-T03 — calculator defaults become editor-configurable.
 *
 * PARITY CONSTRAINT: the launch values here MUST equal the hard-coded values in
 * the current site exactly, or a P-class output moves (PRD §5.4, BPM-001).
 * incomeMultiple is 0.30 and is verified against production to the centavo.
 * Changing it changes what every visitor is told they can borrow.
 */
export const CalculatorDefaults: GlobalConfig = {
  slug: 'calculator-defaults',
  admin: { group: 'Settings' },
  access: { read: anyone, update: isAdmin },
  fields: [
    {
      name: 'incomeMultiple',
      type: 'number',
      required: true,
      defaultValue: 0.3,
      admin: {
        description:
          'Share of gross monthly income treated as available for amortisation. FROZEN AT 0.30 for launch — verified against production 22 Aug 2026 (BPM-001). Any other value is a deviation requiring sign-off.',
      },
    },
    {
      name: 'termOptions',
      type: 'array',
      admin: { description: 'Live options are 5/10/15/20/25/30. Default is 5.' },
      fields: [{ name: 'years', type: 'number', required: true }],
    },
    {
      name: 'defaultTermYears',
      type: 'number',
      defaultValue: 5,
    },
    {
      name: 'disclaimer',
      type: 'textarea',
      admin: { description: 'FR-T07 — indicative estimate wording. E-class addition; the current site shows none.' },
    },
  ],
}
