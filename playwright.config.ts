import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"
const shouldStartWebServer = !process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  maxFailures: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  workers: process.env.CI ? 2 : undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: shouldStartWebServer
    ? {
        // NOTE: Next.js does not allow multiple `next dev` processes in the same repo
        // (it uses `.next/dev/lock`). If you already have `npm run dev` running,
        // set `PLAYWRIGHT_BASE_URL` to reuse it.
        command: "npm run dev:e2e",
        url: baseURL,
        // Always reuse if something is already listening on baseURL.
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          // Dummy values; tests mock network calls so no real Supabase is required.
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
          E2E_TEST: "1",
          NEXT_PUBLIC_E2E_TEST: "1",
        },
      }
    : undefined,
})

