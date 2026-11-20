import { createHash } from "node:crypto";

/**
 * M1.4 — the idempotency key. The SHA-256 of the uploaded workbook bytes is what
 * makes re-running the importer a no-op (FR-M1-10): run_workbook_import stores it
 * per workspace (unique), and a second upload of the same file is refused. Content
 * hash, not filename, so a renamed copy is still recognised as the same import.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
