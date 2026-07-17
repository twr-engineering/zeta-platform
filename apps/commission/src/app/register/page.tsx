import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Create your workspace" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your workspace"
      description="One workspace per agent — your own book of business."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={ROUTES.login}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
