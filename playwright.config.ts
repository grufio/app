/**
 * Playwright E2E configuration.
 *
 * Responsibilities:
 * - Configure browser projects, timeouts, and dev-server startup for CI/local runs.
 */
import { defineConfig, devices } from "@playwright/test"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110"
const shouldStartWebServer = process.env.PLAYWRIGHT_USE_WEBSERVER === "1"
const webServerCommand = process.env.PLAYWRIGHT_WEBSERVER_COMMAND ?? "npm run dev:e2e"
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1"
const hostArch = (process.env.PLAYWRIGHT_HOST_ARCH ?? process.arch) === "arm64" ? "arm64" : "x64"

function resolvePlaywrightBrowsersBaseDir(): string {
  const configured = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!configured || configured === "0") return path.resolve(process.cwd(), ".playwright-browsers")
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured)
}

function getNewestVersionedDir(baseDir: string, prefix: string): string | null {
  if (!existsSync(baseDir)) return null
  const entries = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  return entries[0] ? path.join(baseDir, entries[0]) : null
}

function resolveChromiumExecutablePath(): string | undefined {
  const baseDir = resolvePlaywrightBrowsersBaseDir()
  const chromiumDir = getNewestVersionedDir(baseDir, "chromium-")
  if (!chromiumDir) return undefined
  const macDir = path.join(chromiumDir, `chrome-mac-${hostArch}`)
  if (!existsSync(macDir)) return undefined

  const knownAppBinaries = [
    path.join(
      macDir,
      "Chromium.app",
      "Contents",
      "MacOS",
      "Chromium"
    ),
    path.join(
      macDir,
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing"
    ),
  ]
  for (const binary of knownAppBinaries) {
    if (existsSync(binary)) return binary
  }
  return undefined
}

const chromiumExecutablePath = resolveChromiumExecutablePath()

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
    launchOptions: chromiumExecutablePath
      ? {
          executablePath: chromiumExecutablePath,
        }
      : undefined,
  },
  workers: process.env.CI ? 2 : undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: shouldStartWebServer
    ? {
        // Server-start mode is explicit via PLAYWRIGHT_USE_WEBSERVER=1.
        // Local standard flow uses the dedicated E2E server on 3110.
        command: webServerCommand,
        url: baseURL,
        // Use explicit mode flags only: either start server, or reuse it.
        reuseExistingServer,
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

