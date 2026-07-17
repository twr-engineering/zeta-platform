import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <ModuleStub
      title="Dashboard"
      module="M6"
      description="Your collections position, pace against target, aging, and the chase list — the Monday-morning screen that tells you which developer to call."
    />
  );
}
