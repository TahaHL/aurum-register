import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.BROWSER_BASE_URL || "http://127.0.0.1:5188",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer:
    process.env.BROWSER_EXTERNAL_SERVER === "true"
      ? undefined
      : {
          command: "npm run dev",
          env: {
            PORT: "3108",
            CLIENT_PORT: "5188",
            APP_ORIGIN: process.env.BROWSER_BASE_URL || "http://127.0.0.1:5188",
            PRICE_PROVIDER: "fixture",
            PREVIEW_DATABASE_PATH: `.local/browser-${Date.now()}`,
          },
          url:
            (process.env.BROWSER_BASE_URL || "http://127.0.0.1:5188") +
            "/api/health",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
  reporter: "list",
});
