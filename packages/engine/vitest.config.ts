import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
      /**
       * Set just below where the suite actually sits, so a real regression trips
       * it while ordinary refactoring does not. The engine is the part that has
       * to be right — a wrong bracket is discovered by twenty people standing on
       * gravel, not by a stack trace.
       *
       * Measured by Vitest 5's AST-aware v8 remapping, which counts statements
       * and branches more strictly than Vitest 3 did; re-baselined on the upgrade.
       */
      thresholds: {
        statements: 93,
        functions: 97,
        lines: 97,
        branches: 80,
      },
    },
  },
});
