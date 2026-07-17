import "server-only";

import {
  activeDevelopers,
  activeLeadSources,
  activePropertyTypes,
  allDevelopers,
  allLeadSources,
  allPropertyTypes,
} from "@/lib/settings/list-queries";
import type { Deal } from "@/types/entities";
import type {
  DeveloperOption,
  LeadSourceOption,
  PropertyTypeOption,
} from "@/components/deals/deal-form";

/**
 * The deal form's dropdown options (§4 rule 15). New deals may only reference
 * ACTIVE items — an archived type must not be offered, or the agent books
 * against a retired item. But an EDIT of a historical deal may legitimately
 * reference an item archived after it was first booked; that item is not in the
 * active list, so it is folded back in marked "(inactive)" — the option can be
 * shown and kept, but the agent is told it is retired.
 */

export type DealFormOptions = {
  propertyTypes: PropertyTypeOption[];
  developers: DeveloperOption[];
  leadSources: LeadSourceOption[];
};

type NamedRow = { id: string; name: string };

/**
 * Merge the deal's own referenced id into the active options if archiving has
 * dropped it out, so the edit form can display and preserve it.
 */
async function ensureReferenced<T extends NamedRow>(
  active: T[],
  referencedId: string | null,
  loadAll: () => Promise<T[]>
): Promise<{ options: { id: string; name: string; inactive?: boolean }[]; }> {
  const options: { id: string; name: string; inactive?: boolean }[] = active.map(
    (row) => ({ id: row.id, name: row.name })
  );
  if (referencedId && !active.some((row) => row.id === referencedId)) {
    const all = await loadAll();
    const found = all.find((row) => row.id === referencedId);
    if (found) options.push({ id: found.id, name: found.name, inactive: true });
  }
  return { options };
}

export async function getDealFormOptions(deal?: Deal): Promise<DealFormOptions> {
  const [propertyTypes, developers, leadSources] = await Promise.all([
    activePropertyTypes(),
    activeDevelopers(),
    activeLeadSources(),
  ]);

  if (!deal) {
    return {
      propertyTypes: propertyTypes.map((p) => ({ id: p.id, name: p.name })),
      developers: developers.map((d) => ({ id: d.id, name: d.name })),
      leadSources: leadSources.map((s) => ({ id: s.id, name: s.name })),
    };
  }

  const [pt, dev, ls] = await Promise.all([
    ensureReferenced(propertyTypes, deal.property_type_id, allPropertyTypes),
    ensureReferenced(developers, deal.developer_id, allDevelopers),
    ensureReferenced(leadSources, deal.lead_source_id, allLeadSources),
  ]);

  return {
    propertyTypes: pt.options,
    developers: dev.options,
    leadSources: ls.options,
  };
}
