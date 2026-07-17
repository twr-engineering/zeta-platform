import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  DELETE_ACCOUNT_PHRASE,
  displayNameSchema,
  emailSchema,
  firstIssue,
  newPasswordSchema,
} from "@/lib/account/account";

/**
 * M0.4 account validation and the delete phrase — the pure rules the server
 * actions and the friction gate rely on. The DB and GoTrue do the real
 * enforcing; these keep the client from offering a save the server will refuse,
 * and pin the exact phrase the typed-confirmation gate checks.
 */

test("display name: trims, requires non-blank, caps at 80", () => {
  assert.equal(displayNameSchema.parse("  JD  "), "JD");

  const blank = displayNameSchema.safeParse("   ");
  assert.equal(blank.success, false);

  const tooLong = displayNameSchema.safeParse("x".repeat(81));
  assert.equal(tooLong.success, false);

  assert.equal(displayNameSchema.safeParse("x".repeat(80)).success, true);
});

test("email: trims, lowercases, rejects malformed", () => {
  assert.equal(emailSchema.parse("  Agent@Solo.TEST "), "agent@solo.test");
  assert.equal(emailSchema.safeParse("not-an-email").success, false);
  assert.equal(emailSchema.safeParse("").success, false);
});

test("new password: at least 8, at most 72 (bcrypt ceiling)", () => {
  assert.equal(newPasswordSchema.safeParse("short").success, false);
  assert.equal(newPasswordSchema.safeParse("longenough").success, true);
  assert.equal(newPasswordSchema.safeParse("x".repeat(72)).success, true);
  assert.equal(newPasswordSchema.safeParse("x".repeat(73)).success, false);
});

test("delete phrase is the exact, stable sentence the gate checks", () => {
  // The gate is case-sensitive and trimmed (gate.ts). If this string ever
  // changes, the UI label, the server gate and this test move together.
  assert.equal(DELETE_ACCOUNT_PHRASE, "delete my workspace");
});

test("firstIssue surfaces the first validation message", () => {
  const parsed = displayNameSchema.safeParse("");
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(typeof firstIssue(parsed.error), "string");
    assert.ok(firstIssue(parsed.error).length > 0);
  }
});
