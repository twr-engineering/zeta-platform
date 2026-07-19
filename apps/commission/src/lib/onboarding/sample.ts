"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  listDevelopers,
  listLeadSources,
  listPropertyTypes,
} from "@/lib/settings/list-queries";
import { consumeYieldEvents } from "@/lib/yield/consume";
import { ROUTES } from "@/lib/routes";
import { D021_FIXTURE } from "./sample-fixture";

/**
 * M10.3 — the sample-data lifecycle server layer (FR-M10-07/09).
 *
 * M10 owns no money: these actions ORCHESTRATE the real M0/M1 write paths (the
 * list-create RPCs the settings screens use; the cleanup cascade RPC). The sample
 * DEAL itself is booked through the standard deal form → createDeal(is_sample), and
 * the sample PAYMENT through the standard payment form → createPayment; both inherit
 * is_sample from the deal in the DB (§3.5). Nothing here computes a figure.
 */

export type SampleReferenceIds = {
  developerId: string | null;
  propertyTypeId: string | null;
  leadSourceId: string | null;
};

/** Case/space-insensitive name match (mirrors M0's list uniqueness). */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Resolve the three D021 reference ids from the workspace's own lists (read-only).
 * A missing one comes back null — the caller decides whether to ensure it.
 */
export async function resolveSampleReferences(): Promise<SampleReferenceIds> {
  const [developers, propertyTypes, leadSources] = await Promise.all([
    listDevelopers(),
    listPropertyTypes(),
    listLeadSources(),
  ]);

  const pick = <T extends { id: string; name: string; archived_at?: string | null }>(
    rows: readonly T[],
    name: string,
  ): string | null => {
    const matches = rows.filter((r) => sameName(r.name, name));
    // Prefer a live (non-archived) list item — the form offers those first.
    const active = matches.find((r) => !r.archived_at);
    return (active ?? matches[0])?.id ?? null;
  };

  return {
    developerId: pick(developers, D021_FIXTURE.developerName),
    propertyTypeId: pick(propertyTypes, D021_FIXTURE.propertyTypeName),
    leadSourceId: pick(leadSources, D021_FIXTURE.leadSourceName),
  };
}

/**
 * Ensure the D021 reference items exist so the typed-along walkthrough can select
 * them, then return their ids. This is guided setup, not silent seeding (M0 rule
 * 11): the agent is actively doing the sample walkthrough, and these are the exact
 * list items D021 needs. Each create goes through the SAME idempotent M0.3 RPC the
 * settings screens use — case-insensitive-unique, so an existing item is reused,
 * never duplicated. List items are workspace config, not financial data; they are
 * NOT sample-flagged and survive the sample cleanup.
 */
export async function ensureSampleReferences(): Promise<SampleReferenceIds> {
  if (!isSupabaseConfigured()) {
    return { developerId: null, propertyTypeId: null, leadSourceId: null };
  }

  const existing = await resolveSampleReferences();
  const supabase = await createClient();

  // Create only what is missing; the RPC refuses a duplicate name, so a race just
  // no-ops and the re-resolve below finds the pre-existing row.
  const creates: PromiseLike<unknown>[] = [];
  if (!existing.developerId) {
    creates.push(
      supabase.rpc("create_developer", {
        p_name: D021_FIXTURE.developerName,
        p_comm_base: D021_FIXTURE.developerCommBase,
      }),
    );
  }
  if (!existing.propertyTypeId) {
    // House & Lot is a threshold-rule type (WORKBOOK §2).
    creates.push(
      supabase.rpc("create_property_type", {
        p_name: D021_FIXTURE.propertyTypeName,
        p_vat_rule: "threshold",
      }),
    );
  }
  if (!existing.leadSourceId) {
    creates.push(
      supabase.rpc("create_lead_source", { p_name: D021_FIXTURE.leadSourceName }),
    );
  }

  if (creates.length > 0) {
    await Promise.all(creates);
    revalidatePath(ROUTES.settingsDevelopers);
    revalidatePath(ROUTES.settingsPropertyTypes);
    revalidatePath(ROUTES.settingsLeadSources);
    revalidatePath(ROUTES.onboarding);
  }

  // Re-resolve so the caller always gets real ids (whether pre-existing or freshly
  // created).
  return resolveSampleReferences();
}

export type SampleCleanupResult =
  | { ok: true; dealsDeleted: number; receivablesDeleted: number; paymentsDeleted: number }
  | { ok: false; error: string };

/**
 * FR-M10-09, rule 5. Remove ALL sample data in one transaction (payments →
 * receivable → deal), then let M2's yield aggregate re-settle. The DB function
 * does the ordered, audited, is_sample-guarded delete + the per-cell yield rebuild;
 * this wrapper drains the yield cursor once more (belt-and-suspenders — the cell
 * recompute already ran in-tx) and revalidates every surface the badge/banner and
 * dashboards live on, so they return to their pre-sample state (AC2).
 */
export async function cleanupSampleData(): Promise<SampleCleanupResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured yet." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cleanup_sample_data");
  if (error) return { ok: false, error: error.message };

  const result = data as unknown as {
    ok: boolean;
    deals_deleted?: number;
    receivables_deleted?: number;
    payments_deleted?: number;
  };
  if (!result?.ok) return { ok: false, error: "Could not remove the sample data." };

  // The in-transaction recompute already corrected the touched yield cells; a final
  // drain heals anything the cursor had pending. Best-effort — the deletes stand.
  try {
    await consumeYieldEvents();
  } catch (e) {
    console.error("yield drain after sample cleanup failed:", e);
  }

  // Everywhere the sample showed up (badge, banner, figures) must refresh.
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.deals);
  revalidatePath(ROUTES.collectibles);
  revalidatePath(ROUTES.payments);
  revalidatePath(ROUTES.onboarding);
  revalidatePath(ROUTES.settingsAuditLog);

  return {
    ok: true,
    dealsDeleted: result.deals_deleted ?? 0,
    receivablesDeleted: result.receivables_deleted ?? 0,
    paymentsDeleted: result.payments_deleted ?? 0,
  };
}

/**
 * Link a just-created sample deal to the wizard state so the banner + cleanup know
 * a sample exists (§3.1/§3.5). Guarded server-side: the RPC refuses a deal that is
 * not is_sample in the caller's workspace.
 */
export async function linkSampleDeal(dealId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_sample_deal", { p_deal_id: dealId });
  if (error) {
    console.error("link_sample_deal failed:", error.message);
    return;
  }
  revalidatePath(ROUTES.onboarding);
  revalidatePath(ROUTES.dashboard);
}
