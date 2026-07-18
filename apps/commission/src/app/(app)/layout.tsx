import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { getWorkspaceContext } from "@/lib/workspace/queries";
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
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getWorkspaceContext();

  if (!context) redirect(ROUTES.login);

  const { workspace, profile, email } = context;

  return (
    <div className="min-h-dvh">
      <AppHeader
        workspaceName={workspace.name}
        email={email}
        displayName={profile?.display_name ?? null}
      />

      <div className="mx-auto flex w-full max-w-screen-2xl">
        <aside className="no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r bg-sidebar p-3 lg:block">
          <SidebarNav />
        </aside>

        {/* min-w-0 lets wide tables scroll inside main instead of stretching
            the page — the 360px requirement dies without it. */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
