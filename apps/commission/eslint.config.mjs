import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // build:check's output dir (NEXT_DIST_DIR=.next-build). Without this,
      // `pnpm run lint` lints Next's generated bundles and reports thousands of
      // problems in code nobody wrote — but only for someone who ran
      // build:check first, which is why it stayed hidden.
      ".next-build/**",
      "out/**",
      "build/**",
      // Playwright and the browser MCP write here; same reasoning.
      "test-results/**",
      "playwright-report/**",
      ".playwright-mcp/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
