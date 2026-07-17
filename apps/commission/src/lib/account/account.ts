import { z } from "zod";

/**
 * The account model's pure pieces (M0.4): validation and the delete phrase.
 *
 * Kept free of `next`, `server-only` and Supabase so the rules can be unit
 * tested without a request — the server actions in ./actions import these and
 * add the I/O.
 */

/** Mirrors the signup rule (auth/actions.ts) so a name valid at signup stays valid. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Names cannot exceed 80 characters.");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.")
  .toLowerCase();

/**
 * Length is the one password rule that reliably matters for financial data; the
 * same bound as auth/actions.ts (bcrypt's 72-byte ceiling is the max).
 */
export const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords cannot exceed 72 characters.");

/**
 * The phrase the agent retypes to delete their account (FR-M0-10, gate.ts
 * `typed` mode). "workspace", not "account": what is destroyed is the whole book
 * of business — every deal, payment and receivable — and the sentence should say
 * the thing that is actually going away. Case-sensitive, trimmed (gate.ts).
 */
export const DELETE_ACCOUNT_PHRASE = "delete my workspace";

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
