"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";
import type { OnboardingStep } from "@/types/entities";
import type { Json } from "@/types/database";
import type { OnboardingStateView } from "./steps";

/**
 * M10.2 — the wizard's state-transition actions.
 *
 * Thin wrappers over the M10.2 RPCs (advance/open/reopen/dismiss/complete),
 * each a single atomic transaction that persists the transition and logs its
 * instrumentation event (FR-M10-18). No money and no financial audit here — the
 * audited work is done by the embedded M0/M1 functions the wizard calls.
 *
 * Every action revalidates the wizard route and the dashboard so the resume
 * prompt / auto-open redirect reflect the new status immediately.
 */

export type OnboardingResult =
  | { ok: true; state: OnboardingStateView }
  | { ok: false; error: string };

function revalidateOnboardingSurfaces(): void {
  revalidatePath(ROUTES.onboarding);
  revalidatePath(ROUTES.dashboard);
}

async function call(
  fn: "open_onboarding" | "reopen_onboarding" | "dismiss_onboarding",
): Promise<OnboardingResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn);
  if (error) return { ok: false, error: error.message };
  revalidateOnboardingSurfaces();
  return { ok: true, state: data as unknown as OnboardingStateView };
}

/** FR-M10-01. The one-time auto-open (not_started → in_progress). No-op otherwise. */
export async function openOnboarding(): Promise<OnboardingResult> {
  return call("open_onboarding");
}

/** Rule 7. Re-run from Settings against current state. */
export async function reopenOnboarding(): Promise<OnboardingResult> {
  return call("reopen_onboarding");
}

/** Rule 1. "Set up later" — one-click, non-destructive. */
export async function dismissOnboarding(): Promise<OnboardingResult> {
  return call("dismiss_onboarding");
}

/** Rule 2. Persist a step transition (resumability) + log completed/skipped. */
export async function advanceOnboarding(
  fromStep: OnboardingStep,
  toStep: OnboardingStep,
  options?: { skipped?: boolean; stepData?: Record<string, unknown> },
): Promise<OnboardingResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_onboarding", {
    p_from_step: fromStep,
    p_to_step: toStep,
    p_skipped: options?.skipped ?? false,
    p_step_data: (options?.stepData ?? null) as Json,
  });
  if (error) return { ok: false, error: error.message };
  revalidateOnboardingSurfaces();
  return { ok: true, state: data as unknown as OnboardingStateView };
}

/** Finish the wizard (status → completed) + log wizard_completed. */
export async function completeOnboarding(
  stepData?: Record<string, unknown>,
): Promise<OnboardingResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_step_data: (stepData ?? null) as Json,
  });
  if (error) return { ok: false, error: error.message };
  revalidateOnboardingSurfaces();
  return { ok: true, state: data as unknown as OnboardingStateView };
}
