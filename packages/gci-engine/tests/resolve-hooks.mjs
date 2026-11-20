import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Lets `node --test` (type stripping, no bundler) load this package's source, which
 * imports extensionless (`./types`) and by directory (`../money`) the way Next and
 * TypeScript resolve them. Relative specifiers only; everything else goes to Node.
 * Same rules as apps/commission/tests/alias-hooks.mjs, minus the @/ alias.
 */
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const resolveToFile = (base) =>
  [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(isFile) ?? null;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      if (!parentDir.includes(`${path.sep}node_modules${path.sep}`)) {
        const target = resolveToFile(path.resolve(parentDir, specifier));
        if (target) return nextResolve(pathToFileURL(target).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
