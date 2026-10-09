import { spawn } from "node:child_process";
import path from "node:path";
const port = process.env.PORT || "3000";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
  throw new Error("Choose a local port between 1024 and 65535");
const child = spawn(
  process.execPath,
  [
    path.resolve("node_modules/next/dist/bin/next"),
    process.argv.includes("--production") ? "start" : "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      LEVOKS_LOCAL_PREVIEW_ORIGIN: `http://127.0.0.1:${port}`,
    },
  },
);
child.once("exit", (code) => {
  process.exitCode = code || 0;
});
