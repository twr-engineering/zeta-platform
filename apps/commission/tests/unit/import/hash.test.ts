import test from "node:test";
import assert from "node:assert/strict";

import { sha256Hex } from "@/lib/import/hash";

test("sha256Hex: deterministic for identical bytes (idempotency key)", () => {
  const a = new Uint8Array([1, 2, 3, 4, 5]);
  const b = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(sha256Hex(a), sha256Hex(b));
  assert.match(sha256Hex(a), /^[0-9a-f]{64}$/);
});

test("sha256Hex: a one-byte difference changes the hash (re-upload of a different file)", () => {
  const a = new Uint8Array([1, 2, 3, 4, 5]);
  const c = new Uint8Array([1, 2, 3, 4, 6]);
  assert.notEqual(sha256Hex(a), sha256Hex(c));
});

test("sha256Hex: known vector for the empty input", () => {
  assert.equal(
    sha256Hex(new Uint8Array([])),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});
