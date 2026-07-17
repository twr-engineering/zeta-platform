import type { Metadata } from "next";

import { SettingsStub } from "@/components/settings/settings-stub";

export const metadata: Metadata = { title: "Lead Sources" };

export default function LeadSourcesSettingsPage() {
  return (
    <SettingsStub
      title="Lead Sources"
      module="M0.3"
      description="Lead Sources feed the Source dropdown on every deal and the Source Performance report — which is what tells you where your commissions actually come from, so it is worth logging honestly from the first deal."
    />
  );
}
