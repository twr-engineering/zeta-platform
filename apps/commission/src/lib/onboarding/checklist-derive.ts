/**
 * M10.3 — the getting-started checklist's PURE shaping (§3.2, FR-M10-15).
 *
 * Server-free so it is unit-testable and importable from client components. The
 * live derivation of the four timestamps happens in the DB (get_checklist_state);
 * this only turns that state into the four card items and the visibility flag. The
 * checklist NEVER gates anything (rule 9) and sample records never tick
 * first_deal/first_payment (rule 10, enforced in SQL).
 */

export type ChecklistState = {
  settingsReviewedAt: string | null;
  firstDealAt: string | null;
  firstPaymentAt: string | null;
  importerRunAt: string | null;
  dismissedAt: string | null;
};

export type ChecklistItemKey =
  | "settings_reviewed"
  | "first_deal"
  | "first_payment"
  | "importer_run";

export type ChecklistItem = {
  key: ChecklistItemKey;
  label: string;
  hint: string;
  done: boolean;
};

/** The four card items, in order, with their done flags derived from the state. */
export function checklistItems(state: ChecklistState): ChecklistItem[] {
  return [
    {
      key: "settings_reviewed",
      label: "Review your tax settings",
      hint: "Confirm your VAT and EWT rates so every computation is right.",
      done: state.settingsReviewedAt !== null,
    },
    {
      key: "first_deal",
      label: "Log your first deal",
      hint: "Book a closed deal — the sample walkthrough doesn't count.",
      done: state.firstDealAt !== null,
    },
    {
      key: "first_payment",
      label: "Log your first payment",
      hint: "Record a commission release; VAT and EWT split automatically.",
      done: state.firstPaymentAt !== null,
    },
    {
      key: "importer_run",
      label: "Import your v30.x workbook",
      hint: "Optional — brings your existing deals and payments across.",
      done: state.importerRunAt !== null,
    },
  ];
}

/** True when the card should show at all (not dismissed). */
export function isChecklistVisible(state: ChecklistState): boolean {
  return state.dismissedAt === null;
}
