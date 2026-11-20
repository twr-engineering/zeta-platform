import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { HelpContentProvider } from "@/components/help/help-content-provider";
import { SampleBanner } from "@/components/sample/sample-banner";
import { getWorkspaceContext } from "@/lib/workspace/queries";
import { getActiveContentBundle } from "@/lib/help/loader";
import { getSampleStatus } from "@/lib/onboarding/queries";
import { ROUTES } from "@/lib/routes";

/**
 * The authenticated shell.
 *
 * Middleware already gates these routes, but this re-checks rather than trusting
 * it: middleware can be bypassed by matcher gaps or config drift, and defence in
 * depth on the *rendering* path is cheap. Awaiting cookies() here also makes
 * every page in the group dynamic, which is what keeps `next build` from
 * prerendering a Supabase client into existence with placeholder credentials.
 */
// Belt and braces for the intent above: awaiting cookies() in this layout does not stop
// Next 15 from prerendering a *page* in parallel, and pages that query Supabase
// directly (the /reports tabs) then fail the build on placeholder credentials. Every
// page in this group is per-user, so none should ever be static.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getWorkspaceContext();

  if (!context) redirect(ROUTES.login);

  const { workspace, profile, email } = context;

  // The active help-content bundle (M10.1) — resolved server-side and cached, then
  // handed to the client provider so every "?" popover renders from memory (< 100 ms)
  // and a republished bundle propagates within the cache TTL (< 5 min).
  const [helpBundle, sample] = await Promise.all([
    getActiveContentBundle(),
    getSampleStatus(),
  ]);

  return (
    <HelpContentProvider initial={helpBundle}>
      <div className="min-h-dvh">
        <AppHeader
          workspaceName={workspace.name}
          email={email}
          displayName={profile?.display_name ?? null}
        />
        {/* M10.3 rule 4 — persistent while sample data is on the books (M1/M4/M5/M6). */}
        {sample.exists && <SampleBanner sampleDealCode={sample.sampleDealCode} />}

        <div className="mx-auto flex w-full max-w-screen-2xl">
          <aside className="no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r bg-sidebar p-3 lg:block">
            <SidebarNav />
          </aside>

          {/* min-w-0 lets wide tables scroll inside main instead of stretching
              the page — the 360px requirement dies without it. */}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </HelpContentProvider>
  );
}
