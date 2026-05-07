/**
 * Vitest configuration for integration tests against a local Postgres.
 *
 * Separate from the main `vitest.config.ts` so:
 *   - `npm run test` (unit) stays Docker-independent and runs in <2 s.
 *   - `npm run test:integration` opt-in, expects `supabase start` to have
 *     brought up a local DB on the standard ports (config.toml).
 *
 * Tests run sequentially (single worker) because they share the same
 * local DB and seed-then-truncate pattern would race otherwise.
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
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Single worker — these tests share a real DB.
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
    // RPC round-trips can take a moment on a cold local Postgres.
    testTimeout: 30_000,
    // No coverage for integration; coverage is a unit-test concept.
  },
})
