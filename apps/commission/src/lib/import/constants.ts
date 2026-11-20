/**
 * M1.4 — importer constants shared by the server actions and the client wizard.
 * Kept out of actions.ts because a "use server" module may only export async
 * functions.
 */

/** The typed-confirmation phrase gating the real import (FR-M1-10). */
export const IMPORT_CONFIRM_PHRASE = "IMPORT";

/** The form field the wizard sets to route one form to the dry-run vs real-run action. */
export const IMPORT_INTENT_FIELD = "intent";
