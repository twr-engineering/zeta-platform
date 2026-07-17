import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DealForm } from "@/components/deals/deal-form";
import { getDealByCode } from "@/lib/deals/queries";
import { getDealFormOptions } from "@/lib/deals/form-options";
import { dealToFormValues } from "@/lib/deals/form-values";

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  return { title: `Edit ${code}` };
}

/**
 * Edit a deal (FR-M1-03). Any input change recomputes the derived figures in the
 * same transaction, the edit carries the deal's version for optimistic locking
 * (§8 — a stale write is refused and the form prompts a reload), and every field
 * change is audit-trailed old→new. Editing a deal that references an item
 * archived after booking keeps that item selected, marked "(inactive)" (rule 15).
 */
export default async function EditDealPage({ params }: PageProps) {
  const { code } = await params;
  const deal = await getDealByCode(code);
  if (!deal) notFound();

  const options = await getDealFormOptions(deal);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Edit {deal.deal_code}
        </h1>
        <p className="text-sm text-muted-foreground">
          {deal.client_name} · changes recompute the figures and are recorded in your audit log.
        </p>
      </header>

      <DealForm
        mode="edit"
        propertyTypes={options.propertyTypes}
        developers={options.developers}
        leadSources={options.leadSources}
        initialValues={dealToFormValues(deal)}
        edit={{ id: deal.id, code: deal.deal_code, version: deal.version }}
      />
    </div>
  );
}
