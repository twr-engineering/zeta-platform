import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListScreen } from "@/components/settings/list-screen";
import { listDevelopers } from "@/lib/settings/list-queries";
import { countAffectedDeals } from "@/lib/settings/recompute-queries";
import {
  DEVELOPER_COMM_BASES,
  DEVELOPER_COMM_BASE_CAPTIONS,
  DEVELOPER_COMM_BASE_LABELS,
} from "@/lib/settings/lists";
import { DEVELOPER_SEEDS } from "@/lib/settings/seed-lists";
import {
  acceptDeveloperSeeds,
  archiveDeveloper,
  createDeveloper,
  deleteDeveloper,
  updateDeveloper,
} from "@/lib/settings/list-actions";

export const metadata: Metadata = { title: "Developers" };

/**
 * Developers (M0 §3.5, §6; FR-M0-05).
 *
 * comm_base is the one field the PRD names outright as a confirmed-recompute
 * (rule 8): changing it "recomputes that developer's deals", because it decides
 * whether your rate applies to the gross contract price or the price net of VAT
 * — a different number on every deal you ever booked with them. The sheet does
 * this live and silently on a VLOOKUP; here it asks, records, and queues.
 */
export default async function DevelopersSettingsPage() {
  const [items, affectedDeals] = await Promise.all([
    listDevelopers(),
    countAffectedDeals(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Developers</CardTitle>
        <CardDescription>
          Developers feed the Developer dropdown on every deal and group your
          receivables. Each carries a commission base, which decides what your
          rate applies to — so changing it restates that developer&rsquo;s deals,
          and asks first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ListScreen
          entity="developer"
          dataset="developers"
          items={items.map((item) => ({
            id: item.id,
            name: item.name,
            archivedAt: item.archived_at,
            referenceCount: item.reference_count,
            attributeValue: item.comm_base,
          }))}
          attribute={{
            field: "commBase",
            label: "Commission base",
            options: DEVELOPER_COMM_BASES.map((base) => ({
              value: base,
              label: DEVELOPER_COMM_BASE_LABELS[base],
              caption: DEVELOPER_COMM_BASE_CAPTIONS[base],
            })),
            // Rule 8, verbatim.
            restating: true,
          }}
          actions={{
            create: createDeveloper,
            update: updateDeveloper,
            archive: archiveDeveloper,
            remove: deleteDeveloper,
            seed: acceptDeveloperSeeds,
          }}
          seeds={DEVELOPER_SEEDS.map((seed) => ({
            name: seed.name,
            detail: DEVELOPER_COMM_BASE_LABELS[seed.comm_base],
          }))}
          emptyDescription="Developers feed the Developer dropdown on every deal and group your receivables on the Collectibles ledger. Each one carries a commission base — Gross applies your rate to the full contract price, Net applies it to the price net of VAT — which changes what every deal with that developer is worth."
          affectedDeals={affectedDeals}
        />
      </CardContent>
    </Card>
  );
}
