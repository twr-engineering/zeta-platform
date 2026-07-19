"use client";

/**
 * M10.2 step 3 — the seed-lists offer (FR-M10-04).
 *
 * EMBEDS the real M0.3 SeedOffer (no fork): the same component, the same accept
 * server actions, the same idempotent seed_* RPCs. A list that already has items
 * is not re-offered — the offer only shows for an empty list, which is exactly
 * how the dedupe-on-re-run guarantee (rule 7) already works on the settings
 * screens (the seed RPC refuses a non-empty list; the UI hides the offer).
 */
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { SeedOffer } from "@/components/settings/seed-offer";
import {
  acceptDeveloperSeeds,
  acceptLeadSourceSeeds,
  acceptPropertyTypeSeeds,
} from "@/lib/settings/list-actions";
import {
  DEVELOPER_SEEDS,
  LEAD_SOURCE_SEEDS,
  PROPERTY_TYPE_SEEDS,
} from "@/lib/settings/seed-lists";
import {
  DEVELOPER_COMM_BASE_LABELS,
  PROPERTY_VAT_RULE_LABELS,
} from "@/lib/settings/lists";
import type { ActionState } from "@/lib/forms/action-state";

export type SeedListsEmptiness = {
  propertyTypes: boolean;
  developers: boolean;
  leadSources: boolean;
};

function AlreadyPresent({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
      <span>
        Your {title} are already set up — nothing to add here. Manage them any
        time in Settings.
      </span>
    </div>
  );
}

export function SeedListsStep({ empty }: { empty: SeedListsEmptiness }) {
  const router = useRouter();
  // Any accepted seed set changes what the wizard should show next time; a
  // refresh re-runs the server component so the accepted list flips to the
  // "already set up" note (the accept action also revalidates /onboarding).
  const onCompleted = (result: ActionState) => {
    if (result.error === null) router.refresh();
  };

  return (
    <div className="space-y-4" data-testid="seed-lists-step">
      {empty.propertyTypes ? (
        <SeedOffer
          entity="property_type"
          seeds={PROPERTY_TYPE_SEEDS.map((seed) => ({
            name: seed.name,
            detail: PROPERTY_VAT_RULE_LABELS[seed.vat_rule],
          }))}
          action={acceptPropertyTypeSeeds}
          onCompleted={onCompleted}
          emptyDescription="Property Types feed the Type dropdown on every deal, and their VAT rule drives the BIR RR 1-2024 computation: Threshold is exempt at or below your VAT threshold and VAT-able strictly above it, while Always VAT and Always Exempt ignore price entirely."
        />
      ) : (
        <AlreadyPresent title="property types" />
      )}

      {empty.developers ? (
        <SeedOffer
          entity="developer"
          seeds={DEVELOPER_SEEDS.map((seed) => ({
            name: seed.name,
            detail: DEVELOPER_COMM_BASE_LABELS[seed.comm_base],
          }))}
          action={acceptDeveloperSeeds}
          onCompleted={onCompleted}
          emptyDescription="Developers feed the Developer dropdown on every deal and group your receivables on the Collectibles ledger. Each one carries a commission base — Gross applies your rate to the full contract price, Net applies it to the price net of VAT — which changes what every deal with that developer is worth."
        />
      ) : (
        <AlreadyPresent title="developers" />
      )}

      {empty.leadSources ? (
        <SeedOffer
          entity="lead_source"
          seeds={LEAD_SOURCE_SEEDS.map((seed) => ({ name: seed.name }))}
          action={acceptLeadSourceSeeds}
          onCompleted={onCompleted}
          emptyDescription="Lead Sources feed the Source dropdown on every deal and the Source Performance report — which is what tells you where your commissions actually come from, so it is worth logging honestly from the first deal."
        />
      ) : (
        <AlreadyPresent title="lead sources" />
      )}
    </div>
  );
}
