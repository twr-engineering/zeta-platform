import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListScreen } from "@/components/settings/list-screen";
import { listLeadSources } from "@/lib/settings/list-queries";
import { countAffectedDeals } from "@/lib/settings/recompute-queries";
import { leadSourceCapWarning } from "@/lib/settings/lists";
import { LEAD_SOURCE_SEEDS } from "@/lib/settings/seed-lists";
import {
  acceptLeadSourceSeeds,
  archiveLeadSource,
  createLeadSource,
  deleteLeadSource,
  reorderLeadSource,
  updateLeadSource,
} from "@/lib/settings/list-actions";

export const metadata: Metadata = { title: "Lead Sources" };

/**
 * Lead Sources (M0 §3.6, §6; FR-M0-06).
 *
 * The only list with no money-bearing attribute — nothing here is gated,
 * because nothing here restates a peso figure. What it has instead is the
 * agent's own ordering: the sheet's Source dropdown reads its list top to
 * bottom, and an agent whose every second deal is a referral wants Referral
 * first, not seventh alphabetically.
 *
 * A rename is rule 6 / prompt edge case 18: deals hold the id, so "YouTube" →
 * "YouTube Organic" propagates everywhere and M7 keeps aggregating them under
 * one row rather than orphaning a year of deals into a bucket that no longer
 * exists (AC6).
 */
export default async function LeadSourcesSettingsPage() {
  const [items, affectedDeals] = await Promise.all([
    listLeadSources(),
    countAffectedDeals(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Sources</CardTitle>
        <CardDescription>
          Lead Sources feed the Source dropdown on every deal and the Source
          Performance report. Drag them into the order you want to see them in —
          the order here is the order on the dropdown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ListScreen
          entity="lead_source"
          dataset="lead-sources"
          items={items.map((item) => ({
            id: item.id,
            name: item.name,
            archivedAt: item.archived_at,
            referenceCount: item.reference_count,
            sortOrder: item.sort_order,
          }))}
          actions={{
            create: createLeadSource,
            update: updateLeadSource,
            archive: archiveLeadSource,
            remove: deleteLeadSource,
            reorder: reorderLeadSource,
            seed: acceptLeadSourceSeeds,
          }}
          seeds={LEAD_SOURCE_SEEDS.map((seed) => ({ name: seed.name }))}
          emptyDescription="Lead Sources feed the Source dropdown on every deal and the Source Performance report — which is what tells you where your commissions actually come from, so it is worth logging honestly from the first deal."
          // The sheet's 50-row cap, kept as advice rather than a limit
          // (§3.6; PRD open question 4 — answered "warning only").
          warning={leadSourceCapWarning(items.length)}
          sortable
          affectedDeals={affectedDeals}
        />
      </CardContent>
    </Card>
  );
}
