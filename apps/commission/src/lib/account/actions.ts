"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { checkConfirmation } from "@/lib/friction/gate";
import { ROUTES } from "@/lib/routes";
import type { ActionState } from "@/lib/forms/action-state";
import {
  DELETE_ACCOUNT_PHRASE,
  displayNameSchema,
  emailSchema,
  firstIssue,
  newPasswordSchema,
} from "./account";

/**
 * Account mutations (M0.4): the display name, the auth-level email and password
 * changes, and account deletion.
 *
 * THE PATTERN IS M0.2'S — authenticate, validate, then let one path do the
 * mutation and its audit entry. The display name goes through a database
 * function (rename_profile) so the update and its audit row share a transaction.
 * Email and password live in auth.users, which GoTrue owns, so those go through
 * the Supabase auth API and record their audit entry immediately after — a
 * best-effort trail, because the auth change is the source of truth and cannot
 * be rolled back by a failed log insert.
 *
 * Every action returns ActionState rather than throwing: a wrong current
 * password and a mismatched delete phrase are expected outcomes, not 500s.
 */

function notConfigured(): ActionState {
  return {
    error:
      "Supabase is not configured yet. Add hosted-project credentials to .env.local.",
  };
}

// --- display name -----------------------------------------------------------

export async function updateDisplayName(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  const parsed = displayNameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_profile", {
    p_display_name: parsed.data,
  });

  if (error) {
    if (error.message.includes("cannot be blank")) {
      return { error: "Enter your name." };
    }
    return { error: `Could not update your name: ${error.message}` };
  }

  const result = data as { changed: boolean; display_name: string } | null;
  if (!result) {
    return { error: "Your name could not be updated. Sign in again and retry." };
  }

  revalidatePath(ROUTES.settingsGeneral);
  revalidatePath(ROUTES.settingsAuditLog);

  if (!result.changed) {
    return { error: null, message: "That is already your name." };
  }
  return { error: null, message: `Your name is now “${result.display_name}”.` };
}

// --- email ------------------------------------------------------------------

/**
 * Changing the sign-in email. Re-authentication first (current password), then
 * GoTrue mails a confirmation link to the NEW address — the change is pending
 * until that link is clicked, and the current session stays valid meanwhile.
 *
 * The re-auth is the hardening: it routes through signInWithPassword, which is
 * one of GoTrue's rate-limited endpoints, so a stolen session cannot silently
 * repoint the account's email without knowing the password.
 */
export async function changeEmail(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) return { error: firstIssue(parsedEmail.error) };

  const newEmail = parsedEmail.data;
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!currentPassword) return { error: "Enter your current password to confirm." };

  if (newEmail === context.email.toLowerCase()) {
    return { error: "That is already your email address." };
  }

  const supabase = await createClient();

  const reauth = await supabase.auth.signInWithPassword({
    email: context.email,
    password: currentPassword,
  });
  if (reauth.error) return { error: "Your current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: `Could not change your email: ${error.message}` };

  // Best-effort trail — the email change is already requested; a failed log
  // must not read as a failed change.
  await supabase.rpc("log_email_change", {
    p_old: context.email,
    p_new: newEmail,
  });

  revalidatePath(ROUTES.settingsGeneral);
  revalidatePath(ROUTES.settingsAuditLog);

  return {
    error: null,
    message: `Confirm the change from the link we sent to ${newEmail}. Your current email keeps working until you do.`,
  };
}

// --- password ---------------------------------------------------------------

/**
 * Changing the password, then invalidating every existing session (M0 §8:
 * "session invalidation on password change").
 *
 * Re-authenticate with the current password (hardening, and it routes through
 * the rate-limited signInWithPassword), update the password, record the event,
 * then sign out globally — which revokes ALL of the user's sessions server-side,
 * including any refresh token minted before the change. The agent is sent back
 * to the sign-in screen and must authenticate with the new password. A password
 * change that left old sessions alive would be the opposite of the guarantee.
 */
export async function changePassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!currentPassword) return { error: "Enter your current password." };

  const parsed = newPasswordSchema.safeParse(formData.get("newPassword"));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();

  const reauth = await supabase.auth.signInWithPassword({
    email: context.email,
    password: currentPassword,
  });
  if (reauth.error) return { error: "Your current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (/different from the old password/i.test(error.message)) {
      return { error: "Choose a password different from your current one." };
    }
    return { error: `Could not change your password: ${error.message}` };
  }

  await supabase.rpc("log_password_change");

  // Global scope: every session for this user, this one included, is revoked.
  await supabase.auth.signOut({ scope: "global" });

  revalidatePath("/", "layout");
  redirect(`${ROUTES.login}?notice=password-changed`);
}

// --- deletion (FR-M0-10) ----------------------------------------------------

/**
 * Deleting the account, and with it the whole workspace (solo agents own their
 * data outright). Behind a TYPED confirmation (gate.ts `typed` mode) — the one
 * irreversible act on this screen — and the UI puts the export offer in front of
 * it first.
 *
 * The delete removes the row from auth.users via the service role. Everything
 * else falls out of the schema: profile and membership cascade from the user,
 * and membership's last-member-out trigger (commission_private.reap_orphaned_workspace) takes
 * the workspace with it — and the workspace cascade carries tax_settings, the
 * audit trail, the settings events and all three lists. So this rides the reaper
 * rather than duplicating a delete-everything routine that could drift from it.
 *
 * It deletes exactly context.userId — the id auth.getUser() just revalidated —
 * never an id from the payload. The service role is the capability; the typed
 * confirmation and "only my own id" are the gate.
 */
export async function deleteAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured();

  const confirmation = checkConfirmation(formData, {
    mode: "typed",
    phrase: DELETE_ACCOUNT_PHRASE,
  });
  if (!confirmation.ok) return { error: confirmation.error };

  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(context.userId);
  if (error) {
    return { error: `Could not delete your account: ${error.message}` };
  }

  // The session now points at a user that no longer exists; clear the cookies
  // so the redirect lands cleanly rather than bouncing through a dead session.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});

  revalidatePath("/", "layout");
  redirect(`${ROUTES.login}?notice=account-deleted`);
}
