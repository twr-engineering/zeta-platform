import { NextResponse, type NextRequest } from 'next/server'

import { buildCsp } from './lib/csp'

/**
 * AUTH-001, first line: no session cookie → pages go to /login (keeping where the user was
 * headed), API routes answer 401 {"error":{"code":"unauthenticated"}}. The cookie is only
 * checked for presence here; every page and route then verifies the session itself.
 */
const COOKIE = 'payload-token'
const PUBLIC_PAGES = ['/login']
// The cron route checks its own secret (CRON_SECRET); it has no session cookie.
const PUBLIC_API = ['/api/auth/login', '/api/cron/purge']

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  // NFR-010: a fresh nonce per request. Next reads it from the request's CSP header and puts it on
  // its own scripts; the browser gets the same header on the response.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const https = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https'
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === 'development', https })
  const next = (extra?: Record<string, string>) => {
    const headers = new Headers(req.headers)
    headers.set('Content-Security-Policy', csp)
    for (const [k, v] of Object.entries(extra ?? {})) headers.set(k, v)
    const res = NextResponse.next({ request: { headers } })
    res.headers.set('Content-Security-Policy', csp)
    return res
  }

  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_API.includes(pathname)) return next()
  if (req.cookies.get(COOKIE)?.value) {
    // Pass the requested path on, so a page whose session turns out to be invalid can still
    // send the user back here after login.
    return next({ 'x-comps-path': pathname + search })
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
  return NextResponse.redirect(url)
}

export const config = {
  // Everything except Next's own assets and the static logo files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|zeta-logo-light.png|zeta-logo-dark.png).*)'],
}
