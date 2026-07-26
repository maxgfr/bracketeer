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
       */
      thresholds: {
        statements: 97,
        functions: 97,
        lines: 97,
        branches: 82,
      },
    },
  },
});
