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

import { build } from "esbuild";

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "zod"],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
};

await Promise.all([
  build({ ...shared, entryPoints: ["src/cli.ts"], outfile: "dist/cli.mjs" }),
  build({ ...shared, entryPoints: ["src/mcp.ts"], outfile: "dist/mcp.mjs" }),
]);

console.log("built dist/cli.mjs and dist/mcp.mjs");
