import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.CLIENT_PORT || 5187),
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:" + (process.env.PORT || 3107),
        timeout: 0,
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
} as Parameters<typeof defineConfig>[0]);
