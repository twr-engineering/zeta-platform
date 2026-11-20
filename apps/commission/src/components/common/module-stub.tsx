import { Construction } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * Placeholder for a module the foundation has routed but not yet implemented.
 *
 * Deliberately honest rather than decorative: it renders no numbers at all. A
 * stub that showed plausible-looking figures would be mock data (CLAUDE.md), and
 * on a product whose whole promise is "these numbers tie to the centavo", a
 * fake ₱ figure is worse than an empty screen. Each feature pass replaces its
 * stub with real queries and a real empty state.
 */
export type ModuleStubProps = {
  title: string;
  /** Milestone handle, e.g. "M1" — the story handle used in commits and prd/progress.txt. */
  module: string;
  /** What this surface will do, in the agent's language. */
  description: string;
};

export function ModuleStub({ title, module, description }: ModuleStubProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <Badge variant="secondary">{module}</Badge>
      </div>

      <EmptyState
        icon={<Construction />}
        title="Not built yet"
        description={
          <>
            {description}{" "}
            <span className="block pt-2 text-xs">
              This screen ships with milestone {module}. The foundation has
              routed it so navigation, auth, and layout are already real.
            </span>
          </>
        }
      />
    </div>
  );
}
