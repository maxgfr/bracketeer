import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

/**
 * Four entry points out of one package: two you import, two you run.
 *
 * The engine and the presets are workspace packages that ship raw TypeScript
 * with `.js` import specifiers — resolvable by a bundler, not by Node. They are
 * bundled in here, which is what turns them from "works inside this repo" into
 * something anybody can install.
 *
 * The version is read from package.json and substituted, so it is right in the
 * binary and in the library. Releases rewrite package.json and nothing else, and
 * this build runs *after* that rewrite.
 */
const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

const define = { __VERSION__: JSON.stringify(version) };

/**
 * `zod` stays external and remains a declared dependency. Bundling it would put
 * a second copy in the tree, and a schema built by that copy fails `instanceof`
 * against a consumer's own zod — the kind of bug that reads as "validation
 * randomly rejects valid input".
 *
 * The MCP SDK is external because it is a real runtime dependency with its own
 * resolution behaviour, and only the server entry touches it.
 */
/**
 * Only `zod` stays external.
 *
 * It has to: a schema built by a bundled copy fails `instanceof` against a
 * consumer's own zod, and the engine's config contract is zod schemas.
 *
 * The MCP SDK used to be external too, which made it a hard dependency of the
 * package — so anybody installing this for the *library* also pulled down a
 * server framework they will never call. It is bundled into the one binary that
 * uses it instead, and `bracketeer-cli` now has exactly one dependency.
 */
const external = ["zod"];

/**
 * The workspace packages must be *inlined*, types included.
 *
 * Without this the declarations come out as `export * from "@bracketeer/engine"`
 * — a package nobody outside this repo can resolve, so `import { replay } from
 * "bracketeer-cli"` type-checks here and fails for every consumer. The JavaScript
 * happens to get bundled anyway; the types do not, which is the sort of asymmetry
 * you only notice from the outside. `test/consumer.test.ts` checks it from there.
 */
const noExternal = [/^@bracketeer\//];

export default defineConfig([
  {
    name: "library",
    entry: { index: "src/lib.ts", presets: "src/presets.ts" },
    format: ["esm", "cjs"],
    /*
     * Types are bundled out of the *emitted* declarations of the workspace
     * packages, not out of their source — see `build:types` in each of them,
     * which `pnpm build` runs first.
     *
     * The reason is the same `.js`-specifier problem that made the engine
     * unusable from Node in the first place: its sources import "./codec/index.js"
     * while the file is "./codec/index.ts", which a bundler resolves and a
     * declaration bundler does not. Point it at real `.d.ts` files and the
     * specifiers line up with `.d.ts` siblings, so everything inlines.
     *
     * `noExternal` alone governs only the JavaScript. Without this the build
     * reported success and shipped `export * from "@bracketeer/engine"` — a
     * package no consumer can resolve.
     */
    // No sourcemaps: they were ~900 kB of the tarball, and the source they map
    // back to is a public repository one click away. The declarations are the
    // part a consumer actually needs, and zod's inference already makes those
    // large.
    dts: {
      resolve: [/^@bracketeer\//],
      compilerOptions: {
        paths: {
          "@bracketeer/engine": ["../engine/dist/index.d.ts"],
          "@bracketeer/presets": ["../presets/dist/index.d.ts"],
        },
      },
    },
    sourcemap: false,
    clean: true,
    treeshake: true,
    external,
    noExternal,
    define,
  },
  {
    name: "binaries",
    // Kept ESM-only and separate: a binary needs a shebang, a library must not
    // have one, and nobody `require()`s a command.
    entry: { cli: "src/cli.ts", mcp: "src/mcp.ts" },
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: false,
    clean: false,
    treeshake: true,
    external,
    noExternal,
    define,
  },
]);
