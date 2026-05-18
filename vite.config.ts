import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 3100}`,
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      external: ['better-sqlite3', 'pdf-parse', 'express', 'jsdom'],
    },
  },
});
