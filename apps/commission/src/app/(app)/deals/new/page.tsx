import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { DealForm } from "@/components/deals/deal-form";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getDealFormOptions } from "@/lib/deals/form-options";
import { emptyDealValues } from "@/lib/deals/form-values";
import { manilaToday } from "@/lib/date/manila";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Log a deal" };

/**
 * Log a new deal (FR-M1-01). The guided form only offers valid inputs — active
 * list items, conditional fields per §4 rule 12 — and shows the engine's figures
 * live before the save (FR-M1-06). The page is a thin server shell: it resolves
 * the dropdown options and the default date, then hands off to the client form.
 */
export default async function NewDealPage() {
  const context = await getWorkspaceContext();

  if (!context?.taxSettings) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<TriangleAlert />}
          title="Set up your tax settings first"
          description="A deal's GCI, VAT and EWT are computed from your workspace tax settings. Add them, then come back to log your first deal."
          action={
            <Button nativeButton={false} render={<Link href={ROUTES.settingsTax} />}>
              Go to Tax Settings
            </Button>
          }
        />
      </div>
    );
  }

  const options = await getDealFormOptions();

  if (options.propertyTypes.length === 0 || options.leadSources.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<TriangleAlert />}
          title="Add your lists first"
          description="Every deal needs a property type and a lead source. Set those up in your configuration lists, then log your first deal."
          action={
            <Button nativeButton={false} render={<Link href={ROUTES.settingsPropertyTypes} />}>
              Go to configuration lists
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Log a deal</h1>
        <p className="text-sm text-muted-foreground">
          Fill in what closed and the money — the numbers on the right update live.
        </p>
      </header>

      <DealForm
        mode="create"
        propertyTypes={options.propertyTypes}
        developers={options.developers}
        leadSources={options.leadSources}
        initialValues={emptyDealValues(manilaToday())}
      />
    </div>
  );
}
