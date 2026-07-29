import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Match apps/web's tsconfig "@/*" path so colocated web tests resolve.
    alias: { "@": path.resolve(import.meta.dirname, "apps/web/src") },
  },
  test: {
    environment: "node",
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
  },
});
