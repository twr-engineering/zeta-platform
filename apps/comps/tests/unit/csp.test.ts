import { describe, expect, it } from 'vitest'

import { SECURITY_HEADERS, buildCsp, tileOrigin } from '@/lib/csp'

describe('Content-Security-Policy (NFR-010)', () => {
  it('allows the app and the tile host only; scripts by nonce', () => {
    const csp = buildCsp({ nonce: 'abc', dev: false, https: true, tile: 'https://tile.openstreetmap.org' })
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("img-src 'self' data: blob: https://tile.openstreetmap.org")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
    // A nonce in style-src would make browsers ignore 'unsafe-inline' and block style attributes.
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'(;|$)/)
  })
  it('dev adds unsafe-eval; plain http never upgrades requests', () => {
    const csp = buildCsp({ nonce: 'x', dev: true, https: false, tile: '' })
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).not.toContain('upgrade-insecure-requests')
  })
  it('tile origin from the env template, including {s} subdomains', () => {
    expect(tileOrigin('https://tile.openstreetmap.org/{z}/{x}/{y}.png')).toBe('https://tile.openstreetmap.org')
    expect(tileOrigin('https://{s}.tile.example.com/{z}/{x}/{y}.png')).toBe('https://*.tile.example.com')
    expect(tileOrigin('not a url')).toBe('')
  })
  it('fixed headers: nosniff, referrer policy, HSTS, no framing', () => {
    const h = Object.fromEntries(SECURITY_HEADERS.map((x) => [x.key, x.value]))
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['Strict-Transport-Security']).toMatch(/^max-age=\d+/)
    expect(h['X-Frame-Options']).toBe('DENY')
  })
})
