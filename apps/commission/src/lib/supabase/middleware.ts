import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv, isSupabaseConfigured } from "./env";
import { isPublicPath, ROUTES } from "@/lib/routes";

/**
 * Refreshes the auth session on every request and gates the protected route
 * group. Called from `src/middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // No credentials yet: fail closed. Protected routes divert to a setup notice
  // rather than rendering unauthenticated, and public marketing/auth pages
  // still render so the app is inspectable before Supabase exists.
  if (!isSupabaseConfigured()) {
    if (isPublicPath(pathname) || pathname === ROUTES.setupRequired) {
      return NextResponse.next({ request });
    }
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.setupRequired;
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });

  const { url: supabaseUrl, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not run code between createServerClient and supabase.auth.getUser().
  // A mistake here makes users appear randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.login;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users have no business on the auth screens.
  if (user && isAuthScreen(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.dashboard;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Must be returned as-is: a fresh NextResponse would drop the refreshed
  // auth cookies and desync the session.
  return supabaseResponse;
}

function isAuthScreen(pathname: string): boolean {
  return (
    pathname === ROUTES.login ||
    pathname === ROUTES.register ||
    pathname === ROUTES.resetPassword
  );
}
