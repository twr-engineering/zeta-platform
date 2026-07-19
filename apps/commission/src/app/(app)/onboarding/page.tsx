import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getOnboardingState } from "@/lib/onboarding/queries";
import { taxAffectedCounts } from "@/lib/settings/recompute-queries";
import {
  listDevelopers,
  listLeadSources,
  listPropertyTypes,
} from "@/lib/settings/list-queries";
import { getImportStatus } from "@/lib/import/queries";
import { getDealFormOptions } from "@/lib/deals/form-options";
import { resolveSampleReferences } from "@/lib/onboarding/sample";
import { manilaToday } from "@/lib/date/manila";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Setup assistant" };

/**
 * The first-run wizard route (M10.2, FR-M10-01). Lives in the (app) group so it
 * carries the app shell + help-content provider (the doctrine callouts render
 * from the in-memory bundle). Everything it shows is real: the workspace name,
 * the live tax settings, the actual empty/non-empty state of each seed list, and
 * the real import status. It never blocks — dismissal is one click (rule 1).
 *
 * The wizard EMBEDS the existing M0/M1 flows rather than reimplementing them, so
 * every audited change flows through the same server actions as the settings
 * screens (M10 owns no financial logic).
 */
export default async function OnboardingPage() {
  const [context, onboarding] = await Promise.all([
    getWorkspaceContext(),
    getOnboardingState(),
  ]);

  if (!context || !onboarding) redirect(ROUTES.login);

  const taxSettings = context.taxSettings;
  if (!taxSettings) redirect(ROUTES.dashboard);

  const [
    affectedDeals,
    propertyTypes,
    developers,
    leadSources,
    importStatus,
    dealFormOptions,
    sampleRefs,
  ] = await Promise.all([
    taxAffectedCounts(),
    listPropertyTypes(),
    listDevelopers(),
    listLeadSources(),
    getImportStatus(),
    getDealFormOptions(),
    resolveSampleReferences(),
  ]);

  const blocked = importStatus.dealCount > 0 || importStatus.lastImport !== null;

  return (
    <OnboardingWizard
      initialState={onboarding}
      workspaceName={context.workspace.name}
      tax={{
        settings: {
          vat_rate: taxSettings.vat_rate,
          vat_registered: taxSettings.vat_registered,
          vat_registered_confirmed_at: taxSettings.vat_registered_confirmed_at,
          ewt_rate: taxSettings.ewt_rate,
          property_vat_threshold: taxSettings.property_vat_threshold,
          chase_idle_months: taxSettings.chase_idle_months,
        },
        affectedDeals,
      }}
      seedEmpty={{
        propertyTypes: propertyTypes.length === 0,
        developers: developers.length === 0,
        leadSources: leadSources.length === 0,
      }}
      importStatus={{
        blocked,
        blockedReason: importStatus.lastImport !== null ? "imported" : "has_deals",
        dealCount: importStatus.dealCount,
        lastImportName: importStatus.lastImport?.file_name ?? null,
      }}
      firstDeal={{
        propertyTypes: dealFormOptions.propertyTypes,
        developers: dealFormOptions.developers,
        leadSources: dealFormOptions.leadSources,
        sampleRefs,
        today: manilaToday(),
      }}
    />
  );
}
