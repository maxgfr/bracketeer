import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      /**
       * The two front ends are argument parsing and printing; the decisions all
       * live in `ops.ts`, which is what the thresholds are really protecting.
       * `cli.ts` runs its own argv on import, so a coverage run cannot execute
       * its command table without a subprocess per command — the consumer and
       * link tests exercise the operations underneath instead.
       */
      exclude: [
        // Argument parsing and printing; `cli.ts` also runs its own argv on
        // import, so covering its command table would need a subprocess each.
        "src/cli.ts",
        "src/mcp.ts",
        // Re-export barrels, and a single constant substituted at build time.
        // Their real behaviour is asserted against `dist/` in consumer.test.ts,
        // which is where it matters — source coverage cannot see a build.
        "src/lib.ts",
        "src/presets.ts",
        "src/version.ts",
      ],
      reporter: ["text", "json-summary"],
      /**
       * Set just below where the suite sits, so a real regression trips it while
       * ordinary refactoring does not — the same rule the engine uses.
       */
      thresholds: { statements: 94, functions: 100, lines: 94, branches: 82 },
    },
  },
});
