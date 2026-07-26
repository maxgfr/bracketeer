import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves the app from https://maxgfr.github.io/bracketeer/, so every
// asset URL needs that prefix. Override with BASE_PATH=/ for a root deployment.
const base = process.env.BASE_PATH ?? "/bracketeer/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  // The engine is consumed straight from TypeScript source across the workspace,
  // so it must not be pre-bundled as an opaque dependency.
  optimizeDeps: { exclude: ["@bracketeer/engine"] },
});
