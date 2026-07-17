/**
 * Human labels for the receivable's audit trail (M4.4 status timeline) — the
 * field and action names the detail view renders in place of the raw DB tokens.
 */

export const RECEIVABLE_FIELD_LABELS: Record<string, string> = {
  status: "Status",
  variance: "Variance",
  written_off: "Written off",
  cancel_reason: "Cancel reason",
  confirmed_collectible: "Confirmed Collectible",
  total_collectible: "Total Collectible",
  next_action_note: "Next Action",
  override_review_flagged_at: "Override review",
};

export const RECEIVABLE_ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  archive: "Archived",
  restore: "Restored",
};

/** A status transition (all logged as 'update') gets a friendlier headline. */
export const RECEIVABLE_STATUS_TRANSITION_LABELS: Record<string, string> = {
  open: "Reopened",
  closed: "Closed",
  cancelled: "Cancelled",
};
