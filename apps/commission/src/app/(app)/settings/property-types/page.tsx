import type { Metadata } from "next";

import { SettingsStub } from "@/components/settings/settings-stub";

export const metadata: Metadata = { title: "Property Types" };

export default function PropertyTypesSettingsPage() {
  return (
    <SettingsStub
      title="Property Types"
      module="M0.3"
      description="Property Types feed the Type dropdown on every deal, and their VAT rule decides whether a deal's list price is VAT-able: Threshold is exempt at or below your VAT threshold and VAT-able strictly above it, while Always VAT and Always Exempt ignore price entirely."
    />
  );
}
