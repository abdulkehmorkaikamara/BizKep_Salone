import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./tests/e2e/fixtures.mjs";

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one seeded database, so run them in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  // PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's Chromium.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
  webServer: {
    command: "node tests/e2e/serve.mjs",
    url: `${BASE_URL}/api/status`,
    timeout: 120000,
    reuseExistingServer: false
  }
});
