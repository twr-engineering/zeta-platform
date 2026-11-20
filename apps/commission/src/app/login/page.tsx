import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your workspace."
      footer={
        <>
          New here?{" "}
          <Link
            href={ROUTES.register}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create your workspace
          </Link>
        </>
      }
    >
      {/* useSearchParams needs a Suspense boundary to keep this page's shell
          statically prerenderable. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
