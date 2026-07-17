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
