import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <ModuleStub
      title="Payments"
      module="M5"
      description="Each commission release with its tax split — VAT, EWT, and the net cash that actually reached you."
    />
  );
}
