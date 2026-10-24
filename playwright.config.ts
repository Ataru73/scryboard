import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  // Serve la build di produzione: lanciare prima `pnpm build` (lo fa `pnpm e2e`).
  webServer: {
    command: "rm -rf e2e/.data && node apps/server/dist/index.js",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(PORT),
      DATABASE_PATH: "e2e/.data/e2e.db",
      ASSETS_DIR: "e2e/.data/assets",
      WEB_DIST_DIR: "apps/web/dist",
    },
  },
});
