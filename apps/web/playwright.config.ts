import { defineConfig, devices } from "@playwright/test";

/**
 * The browser tests.
 *
 * These exist for one claim the unit tests structurally cannot check: that a
 * watch link shows a spectator nothing private and offers them no controls. The
 * vitest suite renders the real components, but inside happy-dom, from
 * TypeScript source — it never loads the built bundle, never runs under the real
 * `/bracketeer/` base path, and stubs out the very things a share link depends
 * on. A promise about what a stranger sees has to be checked in the thing a
 * stranger uses.
 *
 * `channel: "chrome"` drives the Chrome that is already installed rather than
 * downloading a browser — true on a developer's Mac and on GitHub's Ubuntu
 * runners alike.
 */
const PORT = 4173;

/** The app is served under a sub-path, as it is on GitHub Pages. */
const BASE = `http://localhost:${PORT}/bracketeer/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },

  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],

  webServer: {
    // Built and previewed, not `vite dev`: the point is to exercise the bundle
    // that actually ships, service worker and base path included.
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
