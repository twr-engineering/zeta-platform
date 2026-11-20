import { SettingsNav } from "@/components/layout/settings-nav";
import { RecomputeBannerSlot } from "@/components/settings/recompute-banner-slot";
import { Badge } from "@/components/ui/badge";

// No `metadata` export here on purpose: a plain `title` on this layout displaces
// the root's "%s · ZETA GCI + Collections" template for its children, so the tab
// read "General" instead of "General · ZETA GCI + Collections". Every section
// page sets its own title, so the layout has no title to contribute anyway.

/**
 * The Settings area shell (M0 §6): one heading and the section nav, wrapped
 * around whichever section is showing.
 *
 * The four configuration lists and the tax settings all drive live computation,
 * so they share a home rather than scattering across the app — the agent should
 * be able to answer "what is this workspace configured to do?" from one place.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Badge variant="secondary">M0</Badge>
      </div>

      {/* Surfaces (and finishes) any recompute left pending by an interrupted
          settings change — FR-M1-07 resumability, workspace-wide. */}
      <RecomputeBannerSlot />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="lg:w-52 lg:shrink-0">
          <SettingsNav />
        </div>

        {/* min-w-0 so a wide table scrolls inside the section instead of
            widening the page — the 360px requirement dies without it. */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
