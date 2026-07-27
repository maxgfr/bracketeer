/**
 * Bundling the two binaries.
 *
 * The engine ships raw TypeScript whose imports say `.js` while the files are
 * `.ts` — which a bundler resolves and plain `node` does not. So `npx bracketeer`
 * cannot work without a build step, and this is it: one self-contained ESM file
 * per binary, with the engine and the presets inlined.
 *
 * The MCP SDK stays external because it is a real runtime dependency with its
 * own resolution behaviour; npm installs it beside the binary.
 */

import { readFileSync } from "node:fs";
import { build } from "esbuild";

/**
 * The version is read here and substituted in, rather than written in the
 * source. Releases are cut by semantic-release, which rewrites package.json and
 * nothing else — so a version typed into a `.ts` file is a version that is wrong
 * from the first release onwards, and `bracketeer version` would quietly report
 * the number somebody last remembered to update by hand.
 *
 * This runs after the bump (see `prepareCmd` in .releaserc.json), so the binary
 * carries the number actually being published.
 */
const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "zod"],
  define: { __VERSION__: JSON.stringify(version) },
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
};

await Promise.all([
  build({ ...shared, entryPoints: ["src/cli.ts"], outfile: "dist/cli.mjs" }),
  build({ ...shared, entryPoints: ["src/mcp.ts"], outfile: "dist/mcp.mjs" }),
]);

console.log("built dist/cli.mjs and dist/mcp.mjs");
