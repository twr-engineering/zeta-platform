import Link from "next/link";

import { ROUTES } from "@/lib/routes";

export type AuthCardProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Shared chrome for the three auth screens. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link
        href={ROUTES.home}
        className="mb-8 flex items-center gap-2 font-semibold"
      >
        <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          Z
        </span>
        <span className="text-sm">ZETA GCI + Collections</span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          {description}
        </p>
        <div className="mt-6">{children}</div>
        {footer && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
