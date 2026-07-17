import test from "node:test";
import assert from "node:assert/strict";

import {
  CHECKED_VALUE,
  CONFIRMATION_FIELD,
  checkConfirmation,
  type FrictionGate,
} from "../../src/lib/friction/gate.ts";

/**
 * M0 test plan #7: "every money-restating mutation requires the confirmation
 * token; API calls without it are rejected (parameterized across settings
 * mutations)."
 *
 * These cover the server-side contract, which is the half that actually gates.
 * The dialog in @/components/friction/confirm-gate only collects the answer —
 * a forged request never renders it, and must still be refused here.
 */

const TYPED: FrictionGate = { mode: "typed", phrase: "DELETE" };
const CHECKED: FrictionGate = { mode: "checked" };

function payload(value?: string): FormData {
  const formData = new FormData();
  // A real action's payload carries its own fields; the gate must ignore them
  // and refuse on the confirmation alone.
  formData.set("workspace_id", "11111111-1111-1111-1111-111111111111");
  if (value !== undefined) formData.set(CONFIRMATION_FIELD, value);
  return formData;
}

test("a payload with no confirmation field is rejected", () => {
  for (const gate of [TYPED, CHECKED]) {
    const result = checkConfirmation(payload(), gate);
    assert.equal(result.ok, false, `${gate.mode} gate must reject a bare payload`);
  }
});

test("typed: the exact phrase passes", () => {
  assert.deepEqual(checkConfirmation(payload("DELETE"), TYPED), { ok: true });
});

test("typed: surrounding whitespace is forgiven", () => {
  // A phone keyboard's trailing space is a typo, not a different answer.
  assert.deepEqual(checkConfirmation(payload("  DELETE "), TYPED), { ok: true });
});

test("typed: the wrong case is rejected", () => {
  // Retyping the exact phrase is the ritual — lowercasing it would mean the
  // agent never actually read what they were asked to type.
  assert.equal(checkConfirmation(payload("delete"), TYPED).ok, false);
});

test("typed: a near miss is rejected", () => {
  for (const attempt of ["", "DELET", "DELETE!", "DELETE ME", "yes"]) {
    assert.equal(
      checkConfirmation(payload(attempt), TYPED).ok,
      false,
      `"${attempt}" must not satisfy a typed gate`
    );
  }
});

test("typed: a checked gate's token does not satisfy it", () => {
  assert.equal(checkConfirmation(payload(CHECKED_VALUE), TYPED).ok, false);
});

test("checked: the acknowledgement token passes", () => {
  assert.deepEqual(checkConfirmation(payload(CHECKED_VALUE), CHECKED), {
    ok: true,
  });
});

test("checked: any other value is rejected", () => {
  // Notably "on", which is what a native checkbox posts by default — the gate
  // must not accept a value the browser supplies for free.
  for (const attempt of ["", "on", "true", "1", "yes", "acknowledge"]) {
    assert.equal(
      checkConfirmation(payload(attempt), CHECKED).ok,
      false,
      `"${attempt}" must not satisfy a checked gate`
    );
  }
});

test("a rejection always explains what to do", () => {
  const rejections = [
    checkConfirmation(payload(), TYPED),
    checkConfirmation(payload("nope"), TYPED),
    checkConfirmation(payload(), CHECKED),
    checkConfirmation(payload("on"), CHECKED),
  ];

  for (const result of rejections) {
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.ok(result.error.length > 0, "a refused gate must say why");
  }
});
