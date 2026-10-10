import type { NextConfig } from "next";

const acceptanceId = process.env.LEVOKS_DEPLOYMENT_API_TEST || "";
const isolatedAcceptance = /^[a-f0-9]{32}$/.test(acceptanceId)
  ? `.verification/deployment-api-${acceptanceId}`
  : undefined;

const nextConfig: NextConfig = {
  // API acceptance uses its own build/lock directory so it can run alongside
  // the browser and cloud API suites without sharing a live server or cookies.
  distDir: isolatedAcceptance
    ? `${isolatedAcceptance}/build`
    : process.env.LEVOKS_DEPLOYMENT_API_TEST === "1"
      ? ".next-deployment-api"
      : process.env.LEVOKS_E2E === "1"
        ? ".next-e2e"
        : ".next",
  ...(isolatedAcceptance
    ? { typescript: { tsconfigPath: `${isolatedAcceptance}/tsconfig.json` } }
    : {}),
  output: "standalone",
  // Disposable databases and test artifacts must never ship with the editor.
  outputFileTracingExcludes: {
    "/*": ["./.levoks-preview/**/*", "./.verification/**/*"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
