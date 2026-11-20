import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ChecklistState } from "./checklist-derive";

/**
 * M10.3 — the getting-started checklist's SERVER read (§3.2, FR-M10-15).
 *
 * The four items are DERIVED LIVE by the get_checklist_state RPC from the existing
 * durable event rows (deals / payments / imports / tax review); this just types the
 * response. The pure shaping (checklistItems / isChecklistVisible) lives in
 * ./checklist-derive so it stays unit-testable and client-importable. The checklist
 * NEVER gates anything (rule 9); sample rows never tick first_deal / first_payment
 * (rule 10, enforced in SQL).
 */
export {
  checklistItems,
  isChecklistVisible,
  type ChecklistState,
  type ChecklistItem,
  type ChecklistItemKey,
} from "./checklist-derive";

/** The workspace's checklist state (derived live), or null with no session. */
export async function getChecklistState(): Promise<ChecklistState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_checklist_state");
  if (error) return null;

  const row = data as unknown as {
    settings_reviewed_at: string | null;
    first_deal_at: string | null;
    first_payment_at: string | null;
    importer_run_at: string | null;
    dismissed_at: string | null;
  };

  return {
    settingsReviewedAt: row.settings_reviewed_at,
    firstDealAt: row.first_deal_at,
    firstPaymentAt: row.first_payment_at,
    importerRunAt: row.importer_run_at,
    dismissedAt: row.dismissed_at,
  };
}
