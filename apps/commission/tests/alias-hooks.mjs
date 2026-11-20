import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Teaches `node --test` how this codebase writes its imports.
 *
 * The unit tests are TypeScript run directly by Node's type stripping — no
 * bundler, no ts-node, which is what keeps them fast and dependency-free. Node
 * reads none of tsconfig.json, though, and its ESM resolver takes no guesses,
 * so two things every module under src/ does are invisible to it:
 *
 *   - the `@/*` alias:  `@/lib/money`        → src/lib/money/index.ts
 *   - extensionless:    `./tax`              → ./tax.ts
 *   - directory index:  `@/lib/money`        → …/index.ts
 *
 * M0.1's only unit test imported a module that imports nothing, so none of this
 * came up. It does the moment a test touches real application code.
 *
 * This resolves what a bundler resolves and nothing else: anything that is not
 * an alias or a relative path falls straight through to Node (node_modules,
 * builtins), and a relative path that already resolves is left alone.
 *
 * Registered via `--import` in the test:unit script, before any test loads.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Node's ESM resolver takes no guesses: hand it a file that exists. */
function resolveToFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];

  return candidates.find(isFile) ?? null;
}

/** The directory a relative specifier resolves against. */
function parentDirOf(parentURL) {
  if (!parentURL?.startsWith("file:")) return null;
  return path.dirname(fileURLToPath(parentURL));
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = resolveToFile(path.join(SRC, specifier.slice(2)));

      if (!target) {
        throw new Error(
          `Could not resolve "${specifier}" under ${SRC}. The @/ alias maps to ` +
            `src/ — check the path exists as a .ts file or a directory with index.ts.`
        );
      }

      return nextResolve(pathToFileURL(target).href, context);
    }

    if (specifier.startsWith(".")) {
      const parentDir = parentDirOf(context.parentURL);

      // A relative import from inside node_modules is a dependency's own business
      // — leave it entirely to Node. Rewriting it (e.g. exceljs's CJS internals,
      // which use extensionless relative requires that happen to resolve to a
      // real .js file) hands the CJS loader a file:// URL it cannot require, and
      // the dependency fails to load (M1.4: the xlsx importer pulls in exceljs).
      if (parentDir && parentDir.includes(`${path.sep}node_modules${path.sep}`)) {
        return nextResolve(specifier, context);
      }

      const target =
        parentDir && resolveToFile(path.resolve(parentDir, specifier));

      // Only rewrite when we actually found a file. A specifier Node can
      // already resolve (a .mjs sibling, an explicit .ts) must go through
      // untouched rather than through our guesses.
      if (target) return nextResolve(pathToFileURL(target).href, context);
    }

    return nextResolve(specifier, context);
  },
});

