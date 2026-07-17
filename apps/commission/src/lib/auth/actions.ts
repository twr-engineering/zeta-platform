"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ROUTES, isPublicPath } from "@/lib/routes";

/**
 * Auth server actions (M0 FR-M0-01).
 *
 * Every mutation validates with Zod before touching Supabase, and returns a
 * plain `ActionState` rather than throwing — auth errors are an expected
 * outcome, and an unhandled throw would surface as a 500 error page.
 */

export type ActionState = {
  error: string | null;
  /** Set on flows that finish without navigating (e.g. "check your email"). */
  message?: string;
};

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.");

// Financial data: length is the one password rule that reliably matters.
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords cannot exceed 72 characters.");

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Names cannot exceed 80 characters."),
});

const resetSchema = z.object({ email: emailSchema });

const updatePasswordSchema = z.object({ password: passwordSchema });

function notConfigured(): ActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

/**
 * `next` comes from a query param, so it is attacker-controlled: only ever
 * honour an internal, non-public path. Anything else falls back to the
 * dashboard rather than becoming an open redirect.
 */
function safeRedirectTarget(next: unknown): string {
  if (typeof next !== "string") return ROUTES.dashboard;
  if (!next.startsWith("/") || next.startsWith("//")) return ROUTES.dashboard;
  if (isPublicPath(next)) return ROUTES.dashboard;
  return next;
}

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function signIn(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately not distinguishing "no such user" from "wrong password" —
    // that difference is an account-enumeration oracle.
    return { error: "Incorrect email or password." };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectTarget(formData.get("next")));
}

export async function signUp(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const origin = await siteOrigin();

  // display_name lands in raw_user_meta_data, where the signup bootstrap
  // trigger reads it to name the workspace ("JD's Book" — M0 §3.1).
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) return { error: error.message };

  return {
    error: null,
    message:
      "Check your email to confirm your account. Your workspace is ready once you verify.",
  };
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const origin = await siteOrigin();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=${ROUTES.updatePassword}`,
  });

  // Always the same response, sent or not — see the enumeration note above.
  return {
    error: null,
    message: "If that email has an account, a reset link is on its way.",
  };
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(ROUTES.dashboard);
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect(ROUTES.login);
}
