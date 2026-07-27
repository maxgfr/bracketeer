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
       * These are data files, and the tests parse and play every entry in them,
       * so anything uncovered is an entry nothing exercises — which is exactly
       * the shape of a preset that would fail the first time somebody picked it.
       */
      thresholds: { statements: 99, functions: 100, lines: 99, branches: 95 },
    },
  },
});
