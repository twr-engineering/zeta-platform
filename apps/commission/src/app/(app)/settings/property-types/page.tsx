import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListScreen } from "@/components/settings/list-screen";
import { listPropertyTypes } from "@/lib/settings/list-queries";
import {
  PROPERTY_VAT_RULES,
  PROPERTY_VAT_RULE_CAPTIONS,
  PROPERTY_VAT_RULE_LABELS,
} from "@/lib/settings/lists";
import { PROPERTY_TYPE_SEEDS } from "@/lib/settings/seed-lists";
import {
  acceptPropertyTypeSeeds,
  archivePropertyType,
  createPropertyType,
  deletePropertyType,
  updatePropertyType,
} from "@/lib/settings/list-actions";

export const metadata: Metadata = { title: "Property Types" };

/**
 * Property Types (M0 §3.4, §6; FR-M0-04).
 *
 * The rows are real, read through RLS, and each reference count is the
 * database's own answer (a PostgREST computed column) rather than this page's
 * guess. It reads 0 for every row until M1 has deals — see
 * app.property_type_reference_count, the one function M1 changes to make the
 * whole archive/delete contract live.
 *
 * The affected-deal count is computed on the server and passed down: the
 * confirmation states a consequence, and a consequence the client invented is
 * worse than none.
 */
export default async function PropertyTypesSettingsPage() {
  const items = await listPropertyTypes();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Property Types</CardTitle>
        <CardDescription>
          Property Types feed the Type dropdown on every deal, and the VAT rule
          you give each one decides whether that deal&rsquo;s list price is
          VAT-able — so changing a rule changes booked figures, and asks first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ListScreen
          entity="property_type"
          dataset="property-types"
          items={items.map((item) => ({
            id: item.id,
            name: item.name,
            archivedAt: item.archived_at,
            referenceCount: item.reference_count,
            attributeValue: item.vat_rule,
          }))}
          attribute={{
            field: "vatRule",
            label: "VAT rule",
            options: PROPERTY_VAT_RULES.map((rule) => ({
              value: rule,
              label: PROPERTY_VAT_RULE_LABELS[rule],
              caption: PROPERTY_VAT_RULE_CAPTIONS[rule],
            })),
            // Not named by rule 8, but it moves Net List Price and therefore GCI
            // — the same restatement by a different route. See
            // LIST_MONEY_RESTATING_FIELDS.
            restating: true,
          }}
          actions={{
            create: createPropertyType,
            update: updatePropertyType,
            archive: archivePropertyType,
            remove: deletePropertyType,
            seed: acceptPropertyTypeSeeds,
          }}
          seeds={PROPERTY_TYPE_SEEDS.map((seed) => ({
            name: seed.name,
            detail: PROPERTY_VAT_RULE_LABELS[seed.vat_rule],
          }))}
          emptyDescription="Property Types feed the Type dropdown on every deal, and their VAT rule drives the BIR RR 1-2024 computation: Threshold is exempt at or below your VAT threshold and VAT-able strictly above it, while Always VAT and Always Exempt ignore price entirely."
        />
      </CardContent>
    </Card>
  );
}
