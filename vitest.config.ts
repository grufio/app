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
      "server-only": fileURLToPath(new URL("./lib/test/shims/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "features/**/*.test.ts", "services/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // CI speed: small suite today, but enable parallel execution as it grows.
    pool: "threads",
    fileParallelism: true,
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      // Scope coverage to directories where unit tests live and where pure
      // logic is meaningful to measure. Routes, generated types, scripts, and
      // E2E surfaces are exercised by other gates (contract tests, Playwright,
      // verify-rls scripts) and would otherwise drag the metric to ~20%.
      include: [
        "lib/**/*.{ts,tsx}",
        "services/**/*.{ts,tsx}",
        "features/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.contract.test.{ts,tsx}",
        "**/types.ts",
        "**/index.ts",
        "lib/test/**",
        "lib/supabase/database.types.ts",
        "e2e/**",
        "node_modules/**",
        ".next/**",
      ],
      thresholds: {
        lines: 22,
        functions: 35,
        branches: 60,
        statements: 22,
      },
    },
  },
})

