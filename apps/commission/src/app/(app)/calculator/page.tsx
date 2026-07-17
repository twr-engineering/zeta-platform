import type { Metadata } from "next";

import { ModuleStub } from "@/components/common/module-stub";

export const metadata: Metadata = { title: "GCI Calculator" };

export default function CalculatorPage() {
  return (
    <ModuleStub
      title="GCI Calculator"
      module="M3"
      description="Your annual GCI goal with seller and buyer funnels, linked live to your own actuals."
    />
  );
}
