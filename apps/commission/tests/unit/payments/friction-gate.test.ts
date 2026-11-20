import test from "node:test";
import assert from "node:assert/strict";

import {
  CHECKED_VALUE,
  CONFIRMATION_FIELD,
  checkConfirmation,
} from "@/lib/friction/gate";

/**
 * M5.4 (rule 11 / AC16) — the server-side friction gate on the money-restating
 * payment mutations. Editing and deleting a payment each restate the receivable, so
 * src/lib/payments/actions.ts calls `checkConfirmation(formData, { mode: "checked" })`
 * FIRST, before the update_payment / delete_payment round-trip — a request without
 * the acknowledgment is refused and nothing is written (no row change, no audit, no
 * event). The RPCs themselves are deliberately NOT gated: the gate is a
 * deliberateness contract enforced in the action layer (gate.ts), while RLS is what
 * keeps tenants apart (proven separately in scripts/live-m54-check.mts).
 *
 * checkConfirmation's generic behavior is covered in tests/unit/friction-gate.test.ts;
 * these pin the exact CONTRACT the payment edit/delete forms submit against, so the
 * field name and token the actions require can't drift out from under the UI.
 */

/** The FormData a payment EDIT submits (payments/[id]/edit) — deal fields + gate. */
function editPayload(confirmation?: string): FormData {
  const fd = new FormData();
  fd.set("id", "11111111-1111-1111-1111-111111111111");
  fd.set("expectedVersion", "3");
  fd.set("deal_id", "22222222-2222-2222-2222-222222222222");
  fd.set("payment_date", "2026-07-09");
  fd.set("gross_amount", "60000");
  fd.set("payment_type", "incentive");
  fd.set("reference_note", "OR-1234");
  if (confirmation !== undefined) fd.set(CONFIRMATION_FIELD, confirmation);
  return fd;
}

/** The FormData a payment DELETE / undo submits — id + version + gate. */
function deletePayload(confirmation?: string): FormData {
  const fd = new FormData();
  fd.set("id", "11111111-1111-1111-1111-111111111111");
  fd.set("expectedVersion", "3");
  if (confirmation !== undefined) fd.set(CONFIRMATION_FIELD, confirmation);
  return fd;
}

const CHECKED = { mode: "checked" } as const;

test("payment edit: a payload with no confirmation is refused (AC16)", () => {
  assert.equal(checkConfirmation(editPayload(), CHECKED).ok, false);
});

test("payment delete: a payload with no confirmation is refused (AC16)", () => {
  assert.equal(checkConfirmation(deletePayload(), CHECKED).ok, false);
});

test("the browser's default checkbox value 'on' does not satisfy the gate", () => {
  // A native checkbox posts "on" for free; the gate must require the explicit
  // acknowledgment token so a stray checkbox can never confirm a restatement.
  assert.equal(checkConfirmation(editPayload("on"), CHECKED).ok, false);
  assert.equal(checkConfirmation(deletePayload("on"), CHECKED).ok, false);
});

test("only the explicit acknowledgment token confirms an edit or a delete", () => {
  assert.equal(checkConfirmation(editPayload(CHECKED_VALUE), CHECKED).ok, true);
  assert.equal(checkConfirmation(deletePayload(CHECKED_VALUE), CHECKED).ok, true);
});

test("the gate ignores the rest of the payload — the token alone decides", () => {
  // Every other field is present and valid; without the token it is still refused.
  const refused = checkConfirmation(editPayload(), CHECKED);
  assert.equal(refused.ok, false);
  // And a bare payload carrying ONLY the token passes (fields are the action's
  // concern, not the gate's).
  const bare = new FormData();
  bare.set(CONFIRMATION_FIELD, CHECKED_VALUE);
  assert.equal(checkConfirmation(bare, CHECKED).ok, true);
});
