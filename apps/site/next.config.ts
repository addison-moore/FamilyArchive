import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Linting runs from the repo root (eslint.config.mjs); skip Next's built-in pass.
  eslint: { ignoreDuringBuilds: true },
  // Monorepo: trace from the workspace root. Docs pages read ../../docs at
  // BUILD time only (force-static); the include is a safety net in case a
  // route ever regresses to dynamic rendering.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/docs/**": ["../../docs/**"],
  },
};

export default nextConfig;
