import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * M1.4 — the importer's entry-state read. The /deals/import page uses it to decide
 * what to show: the upload flow on a fresh workspace, or a "already imported / this
 * workspace already has deals" notice (the importer preserves codes, so it is an
 * onboarding step, not a merge). RLS scopes every row to the caller (M0 rule 1).
 */

export type ImportStatus = {
  /** How many deals already exist — the importer only runs at zero. */
  dealCount: number;
  /** The most recent workbook import, if any. */
  lastImport: {
    file_name: string | null;
    created_at: string;
    summary: Record<string, unknown>;
  } | null;
};

export async function getImportStatus(): Promise<ImportStatus> {
  const supabase = await createClient();

  const [{ count, error: countError }, { data: batch, error: batchError }] =
    await Promise.all([
      supabase.from("deal").select("id", { count: "exact", head: true }),
      supabase
        .from("import_batch")
        .select("file_name,created_at,summary")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          file_name: string | null;
          created_at: string;
          summary: Record<string, unknown>;
        }>(),
    ]);

  if (countError) throw new Error(`Could not read your deals: ${countError.message}`);
  if (batchError) throw new Error(`Could not read import history: ${batchError.message}`);

  return { dealCount: count ?? 0, lastImport: batch ?? null };
}
