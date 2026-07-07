import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Linting runs from the repo root (eslint.config.mjs); skip Next's built-in pass.
  eslint: { ignoreDuringBuilds: true },
  // Monorepo: trace files from the workspace root so standalone output includes
  // hoisted dependencies.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Internal packages export TypeScript source directly.
  transpilePackages: [
    "@familyarchive/auth",
    "@familyarchive/config",
    "@familyarchive/db",
    "@familyarchive/shared",
  ],
};

export default nextConfig;
