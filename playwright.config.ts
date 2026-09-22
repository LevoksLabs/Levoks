import { defineConfig } from "@playwright/test";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(".verification/browsers");
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  outputDir: ".verification/e2e-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".verification/e2e-report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3200",
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200",
    timeout: 120000,
    reuseExistingServer: process.env.LEVOKS_REUSE_TEST_SERVER === "1",
    env: { LEVOKS_E2E: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
