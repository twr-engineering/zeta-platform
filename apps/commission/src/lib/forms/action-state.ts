/**
 * The shape every form server action returns.
 *
 * Actions return this rather than throwing: a rejected mutation is an expected
 * outcome (a failed validation, a refused confirmation), and an unhandled throw
 * would surface to the agent as a 500 page instead of a sentence they can act on.
 */
export type ActionState = {
  error: string | null;
  /** Set on flows that finish without navigating (e.g. "Saved"). */
  message?: string;
};

export const IDLE: ActionState = { error: null };
