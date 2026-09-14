import { defineConfig } from "@playwright/test";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(".verification/browsers");
export default defineConfig({
  testDir: "./tests/generated-e2e",
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  outputDir: ".verification/generated-e2e-results",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: ".verification/generated-e2e-report", open: "never" },
    ],
  ],
  use: {
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
