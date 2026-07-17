import "server-only";

import {
  DEVELOPER_COMM_BASE_LABELS,
  PROPERTY_VAT_RULE_LABELS,
} from "@/lib/settings/lists";
import {
  listDevelopers,
  listLeadSources,
  listPropertyTypes,
} from "@/lib/settings/list-queries";
import type { ExportColumn, ExportDataset } from "./format";
import type { Developer, LeadSource, PropertyType } from "@/types/entities";
import type { WithReferenceCount } from "@/lib/settings/list-queries";

/**
 * The export registry (FR-M0-09: "each list table supports CSV/XLSX export").
 *
 * A dataset is a name, its columns, and a loader. The route handler next door
 * knows nothing else, so adding M5's payments export or M0.4's whole-workspace
 * zip is a new entry here — not a new endpoint, a new CSV writer, and a new set
 * of auth mistakes.
 *
 * THE LOADER IS THE SAME QUERY THE SCREEN USES, and that is the requirement, not
 * a shortcut: AC8 says the download must match "the on-screen rows". Two queries
 * that are supposed to agree eventually do not — most cheaply the day someone
 * adds a filter to one of them — and an export that silently disagrees with the
 * screen is worse than no export, because it gets emailed to an accountant.
 *
 * Rows arrive RLS-scoped, exactly as the screen gets them. There is no
 * workspace_id parameter here on purpose; see the route handler.
 */

/** Shown as "Archived"/"Active" rather than a timestamp the reader must decode. */
function archivedState(row: { archived_at: string | null }): string {
  return row.archived_at ? "Archived" : "Active";
}

const PROPERTY_TYPE_COLUMNS: readonly ExportColumn<
  WithReferenceCount<PropertyType>
>[] = [
  { header: "Property Type", type: "text", value: (r) => r.name, width: 26 },
  {
    header: "VAT Rule",
    type: "text",
    // The label, not the enum token: this file is for the agent, and the audit
    // log is where the stored value is the point.
    value: (r) => PROPERTY_VAT_RULE_LABELS[r.vat_rule],
    width: 16,
  },
  { header: "Status", type: "text", value: archivedState, width: 12 },
  { header: "Used by (deals)", type: "number", value: (r) => r.reference_count, width: 16 },
  { header: "Archived at", type: "date", value: (r) => r.archived_at, width: 20 },
];

const DEVELOPER_COLUMNS: readonly ExportColumn<WithReferenceCount<Developer>>[] = [
  { header: "Developer", type: "text", value: (r) => r.name, width: 30 },
  {
    header: "Commission Base",
    type: "text",
    value: (r) => DEVELOPER_COMM_BASE_LABELS[r.comm_base],
    width: 18,
  },
  { header: "Status", type: "text", value: archivedState, width: 12 },
  { header: "Used by (deals)", type: "number", value: (r) => r.reference_count, width: 16 },
  { header: "Archived at", type: "date", value: (r) => r.archived_at, width: 20 },
];

const LEAD_SOURCE_COLUMNS: readonly ExportColumn<WithReferenceCount<LeadSource>>[] = [
  { header: "Order", type: "number", value: (r) => r.sort_order, width: 8 },
  { header: "Lead Source", type: "text", value: (r) => r.name, width: 30 },
  { header: "Status", type: "text", value: archivedState, width: 12 },
  { header: "Used by (deals)", type: "number", value: (r) => r.reference_count, width: 16 },
  { header: "Archived at", type: "date", value: (r) => r.archived_at, width: 20 },
];

/** The URL segment: /api/export/property-types?format=csv */
export const EXPORT_DATASETS = [
  "property-types",
  "developers",
  "lead-sources",
] as const;

export type ExportDatasetName = (typeof EXPORT_DATASETS)[number];

export function isExportDataset(value: string): value is ExportDatasetName {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

export async function loadExportDataset(
  name: ExportDatasetName
): Promise<ExportDataset<never>> {
  switch (name) {
    case "property-types":
      return {
        name: "property-types",
        sheet: "Property Types",
        columns: PROPERTY_TYPE_COLUMNS,
        rows: await listPropertyTypes(),
      } as unknown as ExportDataset<never>;

    case "developers":
      return {
        name: "developers",
        sheet: "Developers",
        columns: DEVELOPER_COLUMNS,
        rows: await listDevelopers(),
      } as unknown as ExportDataset<never>;

    case "lead-sources":
      return {
        name: "lead-sources",
        sheet: "Lead Sources",
        columns: LEAD_SOURCE_COLUMNS,
        rows: await listLeadSources(),
      } as unknown as ExportDataset<never>;
  }
}
