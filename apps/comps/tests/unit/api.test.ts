import { describe, expect, it } from 'vitest'

import { apiError, readBody, sameOrigin } from '@/lib/api'

const req = (headers: Record<string, string>, body?: string) =>
  new Request('http://localhost:3002/api/x', { method: 'POST', headers, body })

describe('api helpers (app PRD §14.1)', () => {
  it('error shape and status', async () => {
    const res = apiError('validation', 'Check the lot area.', 'area')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: { code: 'validation', message: 'Check the lot area.', field: 'area' } })
    expect((await apiError('unauthenticated').json())).toEqual({ error: { code: 'unauthenticated' } })
    expect(apiError('rate_limited').status).toBe(429)
  })
  it('sameOrigin requires the Origin to match the host (CSRF)', () => {
    expect(sameOrigin(req({ origin: 'http://localhost:3002', host: 'localhost:3002' }))).toBe(true)
    expect(sameOrigin(req({ origin: 'https://evil.example', host: 'localhost:3002' }))).toBe(false)
    expect(sameOrigin(req({ host: 'localhost:3002' }))).toBe(false)
  })
  it('readBody refuses unknown keys and non-JSON', async () => {
    expect(await readBody(req({}, '{"email":"a","password":"b"}'), ['email', 'password'])).toEqual({ email: 'a', password: 'b' })
    expect(await readBody(req({}, '{"email":"a","extra":1}'), ['email', 'password'])).toBeNull()
    expect(await readBody(req({}, 'not json'), ['email'])).toBeNull()
  })
})
