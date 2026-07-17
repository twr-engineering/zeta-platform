import type { Metadata } from "next";

import { SettingsStub } from "@/components/settings/settings-stub";

export const metadata: Metadata = { title: "Developers" };

export default function DevelopersSettingsPage() {
  return (
    <SettingsStub
      title="Developers"
      module="M0.3"
      description="Developers feed the Developer dropdown on every deal and group your receivables on the Collectibles ledger. Each one carries a commission base — Gross applies your rate to the full contract price, Net applies it to the price net of VAT — which changes what every deal with that developer is worth."
    />
  );
}
