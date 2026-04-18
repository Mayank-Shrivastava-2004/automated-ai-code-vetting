import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Allow `import ... from "@shared/types"` inside the frontend
      "@shared/types": path.resolve(__dirname, "../types/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API calls to the backend
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
