import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { TaxSettingsForm } from "@/components/settings/tax-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { countAffectedDeals } from "@/lib/settings/recompute-queries";

export const metadata: Metadata = { title: "Tax Settings" };

/**
 * Tax Settings (M0 §3.3, §6; FR-M0-03).
 *
 * The row is real — created by the signup bootstrap, read through the settings
 * cache, and rendered with rates as the exact decimal strings they are stored
 * as. Nothing here is a default typed into a placeholder.
 *
 * The affected-deal count is computed on the server and passed down: the
 * confirmation states a consequence, and a consequence the client made up is
 * worse than none.
 */
export default async function TaxSettingsPage() {
  const context = await getWorkspaceContext();
  const taxSettings = context?.taxSettings ?? null;

  if (!taxSettings) {
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="No tax settings found"
        description="Every workspace is created with tax settings by the signup bootstrap. If you are seeing this, the database trigger did not run — check that the foundation migrations were applied."
      />
    );
  }

  const affectedDeals = await countAffectedDeals();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Settings</CardTitle>
        <CardDescription>
          These values drive every computation in the product — the commission
          engine, payment splits, and the chase flag. Changing a rate restates
          money you have already booked, so those changes ask before they land
          and are recorded in your audit log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TaxSettingsForm
          settings={{
            vat_rate: taxSettings.vat_rate,
            vat_registered: taxSettings.vat_registered,
            vat_registered_confirmed_at: taxSettings.vat_registered_confirmed_at,
            ewt_rate: taxSettings.ewt_rate,
            property_vat_threshold: taxSettings.property_vat_threshold,
            chase_idle_months: taxSettings.chase_idle_months,
          }}
          affectedDeals={affectedDeals}
        />
      </CardContent>
    </Card>
  );
}
