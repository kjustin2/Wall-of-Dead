import { defineConfig } from "vite";

// Static-site bundling. The game ships as ES modules; Electron serves the
// production build (dist/) over a loopback HTTP server — see electron-main.cjs.
export default defineConfig({
  base: "./",
  server: { port: 5180 },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
