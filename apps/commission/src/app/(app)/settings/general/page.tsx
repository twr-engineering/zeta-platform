import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { EmptyState } from "@/components/common/empty-state";
import { LockedValue } from "@/components/affordance/locked-value";
import { RenameWorkspaceForm } from "@/components/settings/rename-workspace-form";
import { DisplayNameForm } from "@/components/account/display-name-form";
import { ChangeEmailForm } from "@/components/account/change-email-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DataOwnership } from "@/components/account/data-ownership";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { formatManilaDateTime } from "@/lib/date/manila";

export const metadata: Metadata = { title: "General" };

/**
 * Settings → General (M0 §6: "workspace name, account").
 *
 * M0.4 makes the account half editable — display name, email (re-verified),
 * password (with global session invalidation) — and adds the data-ownership
 * card: the whole-workspace export and account deletion (FR-M0-10). The name,
 * email and password each save independently so one failing never blocks
 * another.
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
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
            Setup assistant
          </CardTitle>
          <CardDescription>
            Re-run the first-run walkthrough any time — review your tax settings,
            top up your lists, or import a workbook. It picks up right where you
            left off and never touches anything you have already set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            nativeButton={false}
            render={<Link href={ROUTES.onboarding} />}
            data-testid="settings-setup-assistant"
          >
            Open the setup assistant
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your identity and sign-in. Each change is recorded in your audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DisplayNameForm currentName={profile?.display_name ?? ""} />
          <Separator />
          <div className="space-y-1.5">
            <h3 className="text-sm font-medium">Email</h3>
            <ChangeEmailForm currentEmail={email} />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <h3 className="text-sm font-medium">Password</h3>
            <ChangePasswordForm currentEmail={email} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            Solo agents own their book outright. Take all of it with you, or end
            the account entirely — no one to ask.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataOwnership />
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
