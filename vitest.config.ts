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
    include: [
      // `.tsx` is included for hook tests that need to render React via
      // @testing-library/react (those files opt into `jsdom` via a
      // file-level `@vitest-environment jsdom` doc-comment, so the default
      // `node` env stays for the bulk of the suite).
      "lib/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "features/**/*.test.{ts,tsx}",
      "services/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
    ],
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
        // Ratchet only upward. Current actual ~35% lines/statements; the
        // floor sits just below to lock in gains without flaking on small
        // run-to-run deltas. Each test wave bumps this toward the new actual.
        lines: 33,
        functions: 73,
        branches: 72,
        statements: 33,
      },
    },
  },
})

