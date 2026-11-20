import type { Metadata } from "next";
import { Database } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";

export const metadata: Metadata = { title: "Setup required" };

/**
 * Shown while `.env.local` still carries PLACEHOLDER_PENDING_CREDENTIALS.
 *
 * Middleware diverts every protected route here rather than rendering them
 * unauthenticated — with no Supabase there is no way to verify a session, and
 * "no auth configured" must never degrade into "no auth required".
 */
export default function SetupRequiredPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <EmptyState
        icon={<Database />}
        title="Supabase isn't connected yet"
        description={
          <>
            This app is built and ready, but it has no database to talk to. Add
            your hosted Supabase project&rsquo;s credentials to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              .env.local
            </code>
            , apply the migrations in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              supabase/migrations/
            </code>
            , then reload.
            <span className="mt-4 block text-left font-mono text-xs">
              NEXT_PUBLIC_SUPABASE_URL
              <br />
              NEXT_PUBLIC_SUPABASE_ANON_KEY
              <br />
              SUPABASE_SERVICE_ROLE_KEY
            </span>
          </>
        }
      />
    </div>
  );
}
