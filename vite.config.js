import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

const apiTarget = process.env.PROOFPILOT_API_ORIGIN || `http://localhost:${process.env.API_PORT || process.env.PORT || 4000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiTarget,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
