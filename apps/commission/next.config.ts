import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `next dev` and `next build` both write to `.next`, so a verification build
   * run while the dev server is up corrupts the dev server's own output and
   * takes it down (learned the hard way, 2026-07-17). The dev server belongs to
   * the user and must survive our builds.
   *
   * `pnpm run build:check` sets NEXT_DIST_DIR to a scratch directory so a
   * typecheck-and-build never touches a running dev server. `pnpm run build`
   * still writes to `.next`, which is what Vercel expects.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /** Workspace packages ship TypeScript source, not built JS (Phase 3, ADR-12). */
  transpilePackages: ["@zeta/gci-engine"],

  /**
   * The M1.4 workbook importer uploads an .xlsx through a Server Action, and
   * Server Actions cap the request body at 1 MB by default. A v30.x ZETA workbook
   * is ~0.7 MB today but a 1,000-deal book is larger, so the limit is raised to
   * 8 MB (the importer's own guard also rejects anything past 8 MB before parsing).
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },

  /**
   * Security response headers (M0.4 hardening pass; M0 §8 "auth hardening
   * appropriate for financial data", SECURITY.md #6/#7).
   *
   * Applied to every response. Deliberately NOT a script/style CSP: a strict one
   * needs per-request nonces on Next's inline bootstrap and would break the app,
   * and a loose one with 'unsafe-inline'/'unsafe-eval' is security theatre. What
   * is set here are the directives that harden with zero breakage —
   * clickjacking, MIME sniffing, referrer leakage, base-tag and form-action
   * hijacking, and HSTS. A full script CSP with nonces is a documented
   * follow-up.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            // Browsers ignore HSTS over http/localhost, so this is inert in dev
            // and takes effect only once the app is served over HTTPS on Vercel.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // No default-src on purpose: it would fall through to connect-src
            // and block the browser Supabase client's calls to the project URL
            // (and Next's dev HMR socket). These four directives harden without
            // governing fetch/script/style, so nothing breaks.
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },

  webpack: (config, { dev }) => {
    if (!dev) return config;

    /**
     * Stop agent tooling from driving the dev server into a recompile loop.
     *
     * Next's watcher ignores only node_modules, .git and .next
     * (webpack-config.ts baseWatchOptions). Two directories that agents write to
     * live in the project root and are therefore watched:
     *
     *   .playwright-mcp/  a page snapshot + console log per browser tool call —
     *                     so browser-driven QA rewrites files on every single
     *                     step, and each write triggers a rebuild. This is what
     *                     made the server loop on "compiled" and stall requests
     *                     mid-flight (2026-07-17).
     *   .next-build/      the scratch dist dir for `pnpm run build:check`.
     *   test-results/,    written by `npx playwright test`, which runs against
     *   playwright-report/  this very dev server — so without this the suite
     *                     recompiles the server it is testing, mid-run.
     *
     * Neither is application source; nothing in the app imports from them, so
     * ignoring them cannot mask a real change. `watchOptions.pollIntervalMs` is
     * the ONLY watch option next.config exposes — there is no supported way to
     * exclude a path — hence reaching into the webpack config here.
     *
     * NOTE: this hook does not run under `next dev --turbopack`, and Turbopack
     * has no exclusion option at all. If dev ever moves to Turbopack, these
     * directories must move outside the project root instead.
     */
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "**/.next-build/**",
        "**/.playwright-mcp/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    };

    return config;
  },
};

export default nextConfig;
