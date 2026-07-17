import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Deals" };

export default function DealsPage() {
  return (
    <ModuleStub
      title="Deals"
      module="M1"
      description="Every closed deal booked through the commission and VAT engine: GCI, NET GCI, tax memos, and yield."
    />
  );
}
