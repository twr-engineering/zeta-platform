import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { LockedValue } from "@/components/affordance/locked-value";
import { RenameWorkspaceForm } from "@/components/settings/rename-workspace-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { formatManilaDateTime } from "@/lib/date/manila";

export const metadata: Metadata = { title: "General" };

/**
 * Settings → General (M0 §6: "workspace name, account").
 *
 * The account half is read-only here on purpose. M0.4 owns the editable account
 * screen — name, email, password change with session invalidation — plus the
 * full-workspace export and deletion. Showing the identity now is honest;
 * shipping a password field that M0.4 has to redo is not.
 */
export default async function GeneralSettingsPage() {
  const context = await getWorkspaceContext();

  if (!context) {
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="No workspace found"
        description="The signup bootstrap creates a workspace with every account. If you are seeing this, the database trigger did not run — check that the foundation migrations were applied."
      />
    );
  }

  const { workspace, profile, email } = context;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            One workspace is one agent&apos;s book of business. Everything in this
            product — deals, payments, receivables — lives inside this one, and
            nobody else can read it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RenameWorkspaceForm currentName={workspace.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Changing your email or password, exporting everything, and deleting
            the account arrive with milestone M0.4.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <ReadOnlyField
            label="Name"
            value={profile?.display_name ?? "—"}
            caption="The name you signed up with."
            formula="Stored on your profile; used to name your workspace at signup."
          />

          <ReadOnlyField
            label="Email"
            value={email}
            caption="Your sign-in address."
            formula="Managed by Supabase Auth. Changing it re-verifies the new address (M0.4)."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace details</CardTitle>
          <CardDescription>
            Set at signup and fixed in v1 — shown so nothing about your workspace
            is hidden from you.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <ReadOnlyField
            label="Currency"
            value={workspace.currency}
            caption="Philippine peso. Fixed in v1."
            formula="₱ #,##0.00 formatting product-wide."
          />

          <ReadOnlyField
            label="Time zone"
            value={workspace.timezone}
            caption="Your workspace's civil day."
            formula="Timestamps store UTC; dates, ageing and the chase flag are computed against this zone."
          />

          <ReadOnlyField
            label="Deals recorded"
            value={String(workspace.deal_id_sequence)}
            caption="Backs your permanent deal IDs (D001…)."
            formula="Increments only — never reused, never renumbered, so a deal code always means the same deal."
          />

          <ReadOnlyField
            label="Workspace created"
            value={formatManilaDateTime(workspace.created_at)}
            caption="When you signed up."
            formula="Recorded in UTC, displayed in your workspace's time zone."
          />
        </CardContent>
      </Card>
    </div>
  );
}

type ReadOnlyFieldProps = {
  label: string;
  value: string;
  caption: string;
  formula: string;
};

function ReadOnlyField({ label, value, caption, formula }: ReadOnlyFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      <LockedValue formula={formula} className="w-full">
        {value}
      </LockedValue>
      <p className="text-xs text-pretty text-muted-foreground">{caption}</p>
    </div>
  );
}
