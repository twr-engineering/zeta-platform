import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ROUTES, isPublicPath } from "@/lib/routes";

/**
 * Landing point for emailed confirmation and recovery links (M0 FR-M0-01).
 *
 * Supabase sends the agent here with a one-time `token_hash`; exchanging it
 * establishes the session cookie, after which they continue to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // FR-M10-01: a signup confirmation is the one unambiguous "first login to a
  // newly created workspace" — land the new owner in the first-run wizard.
  // An explicit `next` (e.g. password recovery → update-password) still wins;
  // everything else defaults to the dashboard.
  const rawNext = searchParams.get("next");
  const next = rawNext
    ? safeNext(rawNext)
    : type === "signup"
      ? ROUTES.onboarding
      : ROUTES.dashboard;

  if (!isSupabaseConfigured()) {
    return redirectTo(request, ROUTES.setupRequired);
  }

  if (!tokenHash || !type) {
    return redirectTo(request, ROUTES.login, "Invalid confirmation link.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return redirectTo(
      request,
      ROUTES.login,
      "That link is invalid or has expired. Request a new one."
    );
  }

  return redirectTo(request, next);
}

/**
 * `next` arrives in a link the user clicked, so treat it as untrusted: only
 * internal, non-public paths, or the dashboard. Without this the confirmation
 * endpoint is an open redirect wearing a trusted domain.
 */
function safeNext(next: string | null): string {
  if (!next) return ROUTES.dashboard;
  if (!next.startsWith("/") || next.startsWith("//")) return ROUTES.dashboard;
  // update-password is intentionally allowed: it is non-public, which is the
  // whole point of arriving there with a fresh recovery session.
  if (isPublicPath(next)) return ROUTES.dashboard;
  return next;
}

function redirectTo(request: NextRequest, pathname: string, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}
