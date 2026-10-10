import { defineConfig } from "@playwright/test";
import path from "node:path";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  outputDir: ".verification/point4-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".verification/point4-report", open: "never" }],
  ],
  use: { ...base.use, baseURL: "http://127.0.0.1:3207" },
  webServer: {
    ...(base.webServer as object),
    command:
      "node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3207",
    url: "http://127.0.0.1:3207",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      LEVOKS_E2E: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      LEVOKS_LOCAL_PREVIEW_ORIGIN: "http://127.0.0.1:3207",
      LEVOKS_PREVIEW_MONGO_BINARY_DIR: path.resolve(
        ".verification/mongodb-bin",
      ),
    },
  },
});
