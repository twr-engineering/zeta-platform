import type { Metadata } from "next";

import { SettingsStub } from "@/components/settings/settings-stub";

export const metadata: Metadata = { title: "Audit Log" };

/**
 * The filterable viewer is M0.2 (FR-M0-08). The table and the write path already
 * exist and are recording — M0.1's workspace rename writes an entry — so this
 * section is a missing *view* over real data, not a missing feature.
 */
export default function AuditLogSettingsPage() {
  return (
    <SettingsStub
      title="Audit Log"
      module="M0.2"
      description="The audit log records every settings change with its old and new value, so you can answer 'when did I switch my EWT to 5%, and what recomputed?' months later — for your own peace of mind, for support, and if the BIR ever asks. Entries are already being recorded; this screen is the filterable view over them."
    />
  );
}
