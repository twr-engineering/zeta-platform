import { NextResponse, type NextRequest } from 'next/server'

/**
 * AUTH-001, first line: no session cookie → pages go to /login (keeping where the user was
 * headed), API routes answer 401 {"error":{"code":"unauthenticated"}}. The cookie is only
 * checked for presence here; every page and route then verifies the session itself.
 */
const COOKIE = 'payload-token'
const PUBLIC_PAGES = ['/login']
const PUBLIC_API = ['/api/auth/login']

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_API.includes(pathname)) return NextResponse.next()
  if (req.cookies.get(COOKIE)?.value) {
    // Pass the requested path on, so a page whose session turns out to be invalid can still
    // send the user back here after login.
    const headers = new Headers(req.headers)
    headers.set('x-comps-path', pathname + search)
    return NextResponse.next({ request: { headers } })
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
