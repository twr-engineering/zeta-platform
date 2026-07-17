/**
 * Supabase credentials are read lazily, never at module scope.
 *
 * Until the hosted project exists, `.env.local` carries
 * PLACEHOLDER_PENDING_CREDENTIALS. A Supabase client constructed with that
 * value throws (it is not a parsable URL), so every client factory in this
 * directory must be called per-request — never evaluated at import time, which
 * would break `next build`.
 */

export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export const PLACEHOLDER = "PLACEHOLDER_PENDING_CREDENTIALS";

export function isPlaceholder(value: string | undefined): boolean {
  return !value || value === PLACEHOLDER;
}

/**
 * True once real hosted-project credentials are present. Route handlers and
 * server components use this to render a "not configured yet" state instead of
 * crashing the render.
 */
export function isSupabaseConfigured(): boolean {
  return (
    !isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isPlaceholder(url) || isPlaceholder(anonKey)) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to real hosted-project values."
    );
  }

  return { url: url as string, anonKey: anonKey as string };
}
