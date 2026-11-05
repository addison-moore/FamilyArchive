import path from "node:path";

import type { NextConfig } from "next";

/**
 * Applied to every response. A self-hosted instance often runs with nothing in front
 * of it to add these. Reset and invite links carry their tokens in the URL, which is
 * why the referrer stays on this origin, and nothing in the app is meant to be framed.
 * The policy is deliberately not a script allowlist: Next's inline bootstrap would
 * need nonces, while these directives protect without touching what can run.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Nothing uses next/image, so the optimizer gets nothing to fetch. It has been the
  // source of several unauthenticated advisories, and an unused route shouldn't be
  // able to reach any file or host.
  images: { localPatterns: [], remotePatterns: [] },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Server Actions default to a 1 MB body, so a GEDCOM import above that died with
    // a generic error while the form promised 10 MB. A little over MAX_GEDCOM_BYTES
    // in trees/import/actions.ts leaves room for the multipart envelope.
    serverActions: { bodySizeLimit: "11mb" },
  },
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
