import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Deliberately outside the public path list: middleware requires a session
 * here, and the recovery link establishes exactly that. An unauthenticated
 * visitor gets bounced to sign-in rather than a password field that cannot work.
 */
export default function UpdatePasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      description="Choose a new password for your account."
    >
      <UpdatePasswordForm />
    </AuthCard>
  );
}
