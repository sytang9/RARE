import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    // Proxy API calls to Express server in web dev mode
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 3100}`,
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      // Prevent Node-only modules from being bundled into the browser build
      external: ['better-sqlite3', 'pdf-parse', 'express', 'jsdom'],
    },
  },
}));
