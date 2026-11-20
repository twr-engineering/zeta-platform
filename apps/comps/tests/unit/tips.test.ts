import { describe, expect, it } from 'vitest'

import { TIPS, tipLabel } from '@/lib/tips'

describe('TIPS (app PRD Appendix B)', () => {
  it('has the 30 tooltips', () => expect(Object.keys(TIPS)).toHaveLength(30))
  it('uses the production wording for status (never "saved deals")', () => {
    expect(TIPS.status[1]).toContain('closed deals')
    for (const [, text] of Object.values(TIPS)) expect(text).not.toContain('saved deals')
  })
  it('keeps the curly apostrophes', () => {
    expect(TIPS.area[1]).toContain('developer’s')
    expect(TIPS.estimate[1]).toContain('property’s')
  })
  it('names each button "About {title in lower case}"', () => {
    expect(tipLabel('cma')).toBe('About comparative market analysis (cma)')
    expect(tipLabel('kind')).toBe('About subdivision or area')
  })
})
