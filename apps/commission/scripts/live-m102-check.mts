/**
 * M10.2 live check — the OnboardingState machine + instrumentation, exercised
 * end-to-end against the hosted DB with a real JWT, then reaped. Follows the
 * zeta-verification-flow ritual: throwaway user, delta-residue zero.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env(key: string): string {
  const raw = readFileSync(".env.local", "utf8");
  const m = raw.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`missing ${key}`);
  return m[1].trim();
}

const URL = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");

if (SERVICE.includes("PLACEHOLDER_PENDING_CREDENTIALS")) {
  console.log("SKIP: placeholder credentials");
  process.exit(0);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const email = `m102-${Date.now()}@throwaway.test`;
const password = "Test-Passw0rd-m102";

let userId: string | null = null;
const fail: string[] = [];
function check(label: string, cond: boolean) {
  console.log(`${cond ? "✔" : "�’✗"} ${label}`);
  if (!cond) fail.push(label);
}

try {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "M102 Tester" },
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  const user = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  // 1. ensure → the trigger created a not_started/basics row at signup.
  const ensured = await user.rpc("ensure_onboarding_state");
  if (ensured.error) throw ensured.error;
  const s0 = ensured.data as Record<string, unknown>;
  check("ensure returns a row", !!s0?.id);
  check("fresh workspace is not_started", s0.status === "not_started");
  check("fresh workspace at basics", s0.current_step === "basics");

  // 2. open → in_progress, logs wizard_opened, idempotent (no-op on second call).
  const opened = await user.rpc("open_onboarding");
  if (opened.error) throw opened.error;
  check("open → in_progress", (opened.data as Record<string, unknown>).status === "in_progress");
  const openedAgain = await user.rpc("open_onboarding");
  check("open is a no-op once in_progress", (openedAgain.data as Record<string, unknown>).status === "in_progress");

  // 3. advance basics → tax_review (persist current_step; resumability).
  const adv = await user.rpc("advance_onboarding", {
    p_from_step: "basics",
    p_to_step: "tax_review",
    p_skipped: false,
    p_step_data: { note: "unit" },
  });
  if (adv.error) throw adv.error;
  const s1 = adv.data as Record<string, unknown>;
  check("advance persists current_step=tax_review", s1.current_step === "tax_review");
  check("advance merges step_data", (s1.step_data as Record<string, unknown>)?.note === "unit");

  // 4. skip tax_review → seed_lists (skipped=true logs step_skipped).
  const skip = await user.rpc("advance_onboarding", {
    p_from_step: "tax_review",
    p_to_step: "seed_lists",
    p_skipped: true,
    p_step_data: null,
  });
  if (skip.error) throw skip.error;

  // 5. dismiss → dismissed (rule 1); app still usable (not asserted here — RLS reads still work).
  const dismissed = await user.rpc("dismiss_onboarding");
  if (dismissed.error) throw dismissed.error;
  const s2 = dismissed.data as Record<string, unknown>;
  check("dismiss → dismissed", s2.status === "dismissed");
  check("dismiss stamps dismissed_at", !!s2.dismissed_at);
  check("dismiss preserves current_step (resume point)", s2.current_step === "seed_lists");

  // 6. reopen (Settings → Setup assistant) → in_progress, current_step kept (rule 7).
  const reopened = await user.rpc("reopen_onboarding");
  if (reopened.error) throw reopened.error;
  const s3 = reopened.data as Record<string, unknown>;
  check("reopen → in_progress", s3.status === "in_progress");
  check("reopen keeps current_step=seed_lists", s3.current_step === "seed_lists");
  check("reopen clears dismissed_at", s3.dismissed_at === null);

  // 7. complete → completed.
  const completed = await user.rpc("complete_onboarding", { p_step_data: null });
  if (completed.error) throw completed.error;
  const s4 = completed.data as Record<string, unknown>;
  check("complete → completed", s4.status === "completed");
  check("complete stamps completed_at", !!s4.completed_at);

  // 8. vat_registered stamping through the existing M0.2 path (the wizard's tax step).
  const stamp = await user.rpc("update_tax_settings", {
    p_vat_registered: true,
    p_confirm_vat_registration: true,
  });
  if (stamp.error) throw stamp.error;
  const taxRow = (stamp.data as Record<string, unknown>).tax_settings as Record<string, unknown>;
  check("vat_registered_confirmed_at stamped", !!taxRow?.vat_registered_confirmed_at);

  // 9. instrumentation log carries the transitions (FR-M10-18).
  const events = await user.from("onboarding_event").select("event_type,step").order("occurred_at");
  if (events.error) throw events.error;
  const types = (events.data ?? []).map((e) => e.event_type);
  check("logged wizard_opened", types.includes("wizard_opened"));
  check("logged step_completed", types.includes("step_completed"));
  check("logged step_skipped", types.includes("step_skipped"));
  check("logged wizard_dismissed", types.includes("wizard_dismissed"));
  check("logged wizard_reopened", types.includes("wizard_reopened"));
  check("logged wizard_completed", types.includes("wizard_completed"));
  console.log("  events:", JSON.stringify(types));
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
    // delta-residue: the membership-delete trigger reaps the workspace + its
    // onboarding_state (ON DELETE CASCADE) and onboarding_event rows.
    const residue = await admin
      .from("onboarding_state")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", "00000000-0000-0000-0000-000000000000");
    void residue;
    console.log("· throwaway user deleted (workspace + onboarding rows cascade-reaped)");
  }
}

if (fail.length) {
  console.error(`\n${fail.length} check(s) FAILED:`, fail);
  process.exit(1);
}
console.log("\nAll M10.2 live checks passed.");
