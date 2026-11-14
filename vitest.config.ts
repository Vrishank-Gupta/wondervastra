import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Browser flows in e2e/ run under Playwright (npm run test:e2e), not here.
  test: { include: ["tests/**/*.test.ts"] },
});
