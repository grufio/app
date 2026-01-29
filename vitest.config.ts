/**
 * Vitest configuration.
 *
 * Responsibilities:
 * - Define test file globs and concurrency settings.
 * - Provide `@` path alias for tests (matches Next/tsconfig usage).
 */
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // CI speed: small suite today, but enable parallel execution as it grows.
    pool: "threads",
    fileParallelism: true,
    maxThreads: 4,
    testTimeout: 10_000,
  },
})

