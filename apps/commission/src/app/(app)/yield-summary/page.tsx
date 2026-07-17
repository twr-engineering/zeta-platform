import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Yield Summary" };

export default function YieldSummaryPage() {
  return (
    <ModuleStub
      title="Yield Summary"
      module="M2"
      description="Realized yields and average sale price by segment — the planning basis your GCI goals are built on."
    />
  );
}
