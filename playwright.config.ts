import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const viewport = { width: 1280, height: 800 };

export default defineConfig({
  testDir: "e2e",
  // I test di prestazioni girano solo con `pnpm e2e:perf`.
  grepInvert: process.env.PERF ? undefined : /@perf/,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  // In locale basta Chromium; in CI (o con ALL_BROWSERS=1) anche Firefox e WebKit (Safari).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport } },
    ...(process.env.CI || process.env.ALL_BROWSERS
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"], viewport } },
          { name: "webkit", use: { ...devices["Desktop Safari"], viewport } },
        ]
      : []),
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
      // I test creano molte stanze dallo stesso indirizzo.
      ROOMS_PER_10_MIN: "1000",
      UPLOADS_PER_10_MIN: "1000",
    },
  },
});
