import type { Metadata } from "next";

import { ImportWizard } from "@/components/import/import-wizard";
import { getImportStatus } from "@/lib/import/queries";

export const metadata: Metadata = { title: "Import workbook" };

/**
 * The v30.x workbook importer (FR-M1-10, M1.4) — the acquisition wedge: a solo
 * agent migrates their existing ZETA workbook in one pass. It PRESERVES the
 * workbook's deal codes, so it only runs on a fresh workspace.
 *
 * The whole flow — upload, dry run, confirm, the post-import success, and the
 * "already imported / this workspace already has deals" state — lives in the
 * client wizard. That is deliberate: a server action refreshes this route when it
 * commits, and if the page hid the wizard once deals existed, that refresh would
 * unmount the success panel the agent just earned. So the server only reads the
 * entry state and hands it to the wizard, which decides what to show (a local
 * just-finished import always wins).
 */
export default async function ImportDealsPage() {
  const status = await getImportStatus();
  const blocked = status.dealCount > 0 || status.lastImport !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Import your ZETA workbook
        </h1>
        <p className="text-sm text-muted-foreground">
          A one-time migration of an existing v30.x ZETA GCI + Collections workbook — its settings,
          all deals (with original codes), payments and collectible statuses — recomputed server-side
          and reconciled to the centavo before anything is written.
        </p>
      </div>

      <ImportWizard
        blocked={blocked}
        blockedReason={status.lastImport !== null ? "imported" : "has_deals"}
        dealCount={status.dealCount}
        lastImportName={status.lastImport?.file_name ?? null}
      />
    </div>
  );
}
