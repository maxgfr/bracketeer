import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // The bootstrap file mounts React and registers the service worker; there
      // is nothing in it to assert that running it would not already prove.
      exclude: ["src/main.tsx"],
      reporter: ["text", "json-summary"],
      /**
       * Set just below where the suite sits. PeerBar drags the average down on
       * purpose: the part of it that matters is the transport, and that is
       * covered by the two-process integration test, which needs the network and
       * so cannot run here.
       */
      thresholds: {
        statements: 90,
        functions: 82,
        lines: 90,
        branches: 78,
      },
    },
  },
});
