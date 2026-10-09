import path from "node:path";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  webServer: {
    command: "node scripts/local-dev.mjs --production",
    url: "http://127.0.0.1:3200",
    timeout: 120000,
    env: {
      PORT: "3200",
      LEVOKS_E2E: "0",
      NEXT_TELEMETRY_DISABLED: "1",
      LEVOKS_PREVIEW_MONGO_BINARY_DIR: path.resolve(".verification/mongodb-bin"),
    },
  },
});
