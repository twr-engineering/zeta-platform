import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

/**
 * Public landing. Copy is drawn from discovery/brief.md — the product's own
 * one-liner and target user, not invented positioning.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            Z
          </span>
          <span className="text-sm">ZETA GCI + Collections</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={ROUTES.login}>Sign in</Link>}
        />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold text-balance sm:text-5xl">
          Know exactly what you&rsquo;ve earned — and what you&rsquo;re still
          owed.
        </h1>

        <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          A commission and VAT engine built for Philippine real estate agents.
          Book every deal BIR-compliant, track what each developer still owes you
          against the cash that actually landed, and plan your GCI goal against
          your own numbers.
        </p>

        <dl className="mt-10 grid gap-6 sm:grid-cols-3">
          <Feature
            term="BIR-compliant engine"
            detail="Property VAT per RR 1-2024, VAT-inclusive commission billing, and creditable EWT for Form 2307 — whether or not you are VAT-registered."
          />
          <Feature
            term="Collections that tie out"
            detail="Total owed per deal versus cash actually collected, with aging and a chase list that tells you who to call."
          />
          <Feature
            term="Goals from real data"
            detail="Your GCI target and funnels, driven by your own realized yields instead of guesses."
          />
        </dl>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            render={<Link href={ROUTES.register}>Create your workspace</Link>}
          />
          <Button
            size="lg"
            variant="outline"
            render={<Link href={ROUTES.login}>Sign in</Link>}
          />
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          One workspace per agent. Your data stays yours — every table exports to
          CSV or XLSX.
        </p>
      </main>
    </div>
  );
}

function Feature({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold">{term}</dt>
      <dd className="mt-1.5 text-sm text-pretty text-muted-foreground">
        {detail}
      </dd>
    </div>
  );
}
