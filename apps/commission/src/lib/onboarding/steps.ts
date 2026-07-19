/**
 * M10.2 — the wizard's step model (pure; safe to import from client or server).
 *
 * The OnboardingState machine (M10 §3.1): one row per workspace, RESUMABLE
 * (rule 2 — leave mid-wizard, come back to current_step) and NEVER-BLOCKING
 * (rule 1 — dismissable at every step, the app is fully usable regardless).
 */

import type { OnboardingState, OnboardingStatus, OnboardingStep } from "@/types/entities";

/** The five steps, in order. M10.2 builds 1–4; first_deal (5) is M10.3's. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "basics",
  "tax_review",
  "seed_lists",
  "migration_fork",
  "first_deal",
] as const;

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  basics: "Basics",
  tax_review: "Tax review",
  seed_lists: "Seed lists",
  migration_fork: "Import or start fresh",
  first_deal: "First deal",
};

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/** 1-based position (for "step N of 5" copy). */
export function stepNumber(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step) + 1;
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)];
}

export function previousStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.max(i - 1, 0)];
}

/**
 * The client-safe view of the state row (the RPCs return exactly this jsonb —
 * see app.onboarding_state_json). No money, no audit ids.
 */
export type OnboardingStateView = {
  id: string;
  workspace_id: string;
  status: OnboardingStatus;
  current_step: OnboardingStep;
  step_data: Record<string, unknown>;
  import_job_id: string | null;
  sample_deal_id: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** True when the non-modal "Continue setup" prompt should show (rule 2 / AC3). */
export function isResumable(view: Pick<OnboardingStateView, "status">): boolean {
  return view.status === "in_progress";
}

/** True on the one-time auto-open condition (FR-M10-01). */
export function shouldAutoOpen(view: Pick<OnboardingStateView, "status">): boolean {
  return view.status === "not_started";
}

/** Narrow a raw row (from a direct select) to the view shape. */
export function toOnboardingView(row: OnboardingState): OnboardingStateView {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    status: row.status,
    current_step: row.current_step,
    step_data: (row.step_data as Record<string, unknown>) ?? {},
    import_job_id: row.import_job_id,
    sample_deal_id: row.sample_deal_id,
    completed_at: row.completed_at,
    dismissed_at: row.dismissed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
