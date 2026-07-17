import { Construction } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";

/**
 * A Settings section that is routed but not yet built.
 *
 * Like ModuleStub, it renders no numbers and no fake rows — a plausible-looking
 * Developers table would be mock data (CLAUDE.md), and on a product that
 * promises figures tying to the centavo, invented data is worse than an empty
 * screen.
 *
 * `description` says what the section *drives*, per M0 §6 — "Lead Sources feed
 * the Source dropdown on every deal and the Source Performance report", never
 * "No lead sources yet".
 */
export type SettingsStubProps = {
  title: string;
  /** Milestone handle that ships it, e.g. "M0.3". */
  module: string;
  description: string;
};

export function SettingsStub({ title, module, description }: SettingsStubProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>

      <EmptyState
        icon={<Construction />}
        title="Not built yet"
        description={
          <>
            {description}{" "}
            <span className="block pt-2 text-xs">
              This section ships with milestone {module}. M0.1 has routed it, so
              navigation, auth, and tenant scoping are already real.
            </span>
          </>
        }
      />
    </div>
  );
}
