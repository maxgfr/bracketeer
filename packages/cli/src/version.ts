/**
 * The version, substituted at build time from package.json.
 *
 * `__VERSION__` is replaced by esbuild (see build.mjs). The fallback covers
 * running the TypeScript directly — tests do that, and a test should not fail
 * over a number it does not care about.
 */
declare const __VERSION__: string | undefined;

export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "0.0.0-dev";
