"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ROUTES } from "@/lib/routes";

/**
 * M10.3 — the only writes to the checklist (§3.2): dismiss (hide the card
 * everywhere) and restore (bring it back from Settings). Both are reversible; the
 * checklist never gates a feature (rule 9). Returns void — the card re-reads the
 * derived state after revalidation.
 */
async function setDismissed(dismissed: boolean): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured()) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_checklist_dismissed", {
    p_dismissed: dismissed,
  });
  if (error) return { ok: false };
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.settings);
  return { ok: true };
}

export async function dismissChecklist(): Promise<{ ok: boolean }> {
  return setDismissed(true);
}

export async function restoreChecklist(): Promise<{ ok: boolean }> {
  return setDismissed(false);
}
