import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  DEVELOPER_SELECT,
  LEAD_SOURCE_SELECT,
  PROPERTY_TYPE_SELECT,
} from "@/lib/supabase/selects";
import type { Developer, LeadSource, PropertyType } from "@/types/entities";

/**
 * Reads for the three configuration lists (FR-M0-07).
 *
 * "All four lists expose a read API used by M1's deal form dropdowns (active
 * items only) and by M7 (active + archived)."
 *
 * THOSE ARE TWO DIFFERENT READS, AND THE SPLIT IS LOAD-BEARING — not a
 * convenience flag. Rule 5 and rule 6 pull in opposite directions:
 *
 *   - M1's dropdown must NOT offer an archived type (AC4: "it disappears from
 *     the M1 dropdown"), or the agent books a new deal against a type they
 *     retired.
 *   - M7 must include archived rows (rule 6, prompt edge case 18: "a renamed or
 *     archived Lead Source must never orphan deals" — they appear as
 *     "(inactive)" buckets).
 *
 * A single read with a default would eventually get the default wrong in one of
 * those places, and the failure is silent in both directions: a dropdown with a
 * retired type in it looks fine, and a report quietly missing a year of deals
 * looks fine too.
 *
 * No `workspace_id` filter anywhere below: RLS scopes every row to the caller's
 * membership (rule 1), and a client-side filter would become the only line of
 * defence the day someone trusted it.
 */

/** A list row as the settings screens need it: the row plus its reference count. */
export type WithReferenceCount<T> = T & { reference_count: number };

/**
 * `reference_count` is the PostgREST computed column (see
 * 20260717210200_m03_reference_count_columns). It runs per row, so it belongs on
 * the settings screens — tens of rows — and NOT on the dropdown reads below.
 * Once M1 makes the counts real, that distinction is what keeps the deal form
 * fast.
 */
const WITH_COUNT = (select: string) => `${select},reference_count`;

function orFail<T>(
  data: T[] | null,
  error: { message: string } | null,
  what: string
): T[] {
  if (error) throw new Error(`Could not read ${what}: ${error.message}`);
  return data ?? [];
}

// --- settings screens (rows + counts, active and archived) ------------------

export async function listPropertyTypes(): Promise<
  WithReferenceCount<PropertyType>[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_type")
    .select(WITH_COUNT(PROPERTY_TYPE_SELECT))
    .order("name", { ascending: true })
    .returns<WithReferenceCount<PropertyType>[]>();

  return orFail(data, error, "your property types");
}

export async function listDevelopers(): Promise<WithReferenceCount<Developer>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer")
    .select(WITH_COUNT(DEVELOPER_SELECT))
    .order("name", { ascending: true })
    .returns<WithReferenceCount<Developer>[]>();

  return orFail(data, error, "your developers");
}

export async function listLeadSources(): Promise<
  WithReferenceCount<LeadSource>[]
> {
  const supabase = await createClient();
  // sort_order, not name: the agent's manual ordering IS the data here (§3.6).
  const { data, error } = await supabase
    .from("lead_source")
    .select(WITH_COUNT(LEAD_SOURCE_SELECT))
    .order("sort_order", { ascending: true })
    .returns<WithReferenceCount<LeadSource>[]>();

  return orFail(data, error, "your lead sources");
}

// --- FR-M0-07: the dropdown read (active only) ------------------------------

/**
 * What M1's deal form consumes. Active items only, by definition (AC4).
 *
 * These are the functions M1 imports — not the ones above. They carry no
 * reference count (a dropdown does not need one, and after M1 it would be a
 * count per option on every render).
 */
export async function activePropertyTypes(): Promise<PropertyType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_type")
    .select(PROPERTY_TYPE_SELECT)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .returns<PropertyType[]>();

  return orFail(data, error, "your property types");
}

export async function activeDevelopers(): Promise<Developer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer")
    .select(DEVELOPER_SELECT)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .returns<Developer[]>();

  return orFail(data, error, "your developers");
}

export async function activeLeadSources(): Promise<LeadSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_source")
    .select(LEAD_SOURCE_SELECT)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .returns<LeadSource[]>();

  return orFail(data, error, "your lead sources");
}

// --- FR-M0-07: the reporting read (active + archived) -----------------------

/**
 * What M7 consumes. Archived rows included, deliberately — rule 6 and prompt
 * edge case 18: an archived source keeps its deals and shows as an "(inactive)"
 * bucket rather than orphaning them. `archived_at` is on the row, so the caller
 * can mark the bucket; it must not have to ask a second question to find out.
 */
export async function allPropertyTypes(): Promise<PropertyType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_type")
    .select(PROPERTY_TYPE_SELECT)
    .order("name", { ascending: true })
    .returns<PropertyType[]>();

  return orFail(data, error, "your property types");
}

export async function allDevelopers(): Promise<Developer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer")
    .select(DEVELOPER_SELECT)
    .order("name", { ascending: true })
    .returns<Developer[]>();

  return orFail(data, error, "your developers");
}

export async function allLeadSources(): Promise<LeadSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_source")
    .select(LEAD_SOURCE_SELECT)
    .order("sort_order", { ascending: true })
    .returns<LeadSource[]>();

  return orFail(data, error, "your lead sources");
}
