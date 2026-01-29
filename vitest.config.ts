import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // CI speed: small suite today, but enable parallel execution as it grows.
    pool: "threads",
    fileParallelism: true,
    maxThreads: 4,
    testTimeout: 10_000,
  },
})

