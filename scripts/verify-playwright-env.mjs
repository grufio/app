/**
 * Preflight checks for deterministic Playwright runtime.
 *
 * Responsibilities:
 * - Validate host/runtime assumptions for local macOS ARM64 usage.
 * - Ensure expected browser executable exists in PLAYWRIGHT_BROWSERS_PATH.
 * - Detect server-mode issues before tests start.
 */
import fs from "node:fs"
import net from "node:net"
import path from "node:path"

function fail(code, message) {
  console.error(`[verify-playwright-env][${code}] ${message}`)
  process.exit(1)
}

function warn(message) {
  console.warn(`[verify-playwright-env] ${message}`)
}

function info(message) {
  console.log(`[verify-playwright-env] ${message}`)
}

function resolveBrowsersBaseDir() {
  const configured = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!configured || configured === "0") return path.resolve(process.cwd(), ".playwright-browsers")
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured)
}

function newestVersionedDir(baseDir, prefix) {
  if (!fs.existsSync(baseDir)) return null
  const candidates = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  return candidates[0] ? path.join(baseDir, candidates[0]) : null
}

function resolveChromiumBinary(baseDir, hostArch) {
  const chromiumDir = newestVersionedDir(baseDir, "chromium-")
  if (!chromiumDir) return null
  const macDir = path.join(chromiumDir, `chrome-mac-${hostArch}`)
  if (!fs.existsSync(macDir)) return null

  const binaries = [
    path.join(macDir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
    path.join(macDir, "Chromium.app", "Contents", "MacOS", "Chromium"),
  ]
  return binaries.find((candidate) => fs.existsSync(candidate)) ?? null
}

async function canReachUrl(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal })
    clearTimeout(timeout)
    return res.status > 0
  } catch {
    return false
  }
}

async function hasE2EBypassEnabled(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/dashboard`, {
      method: "GET",
      redirect: "manual",
      headers: {
        "x-e2e-test": "1",
        "x-e2e-user": "1",
      },
    })
    // In E2E mode, auth bypass should prevent redirect to /login.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? ""
      if (location.includes("/login")) return false
    }
    return true
  } catch {
    return false
  }
}

async function isTcpPortInUse(host, port) {
  return await new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (inUse) => {
      socket.destroy()
      resolve(inUse)
    }
    socket.setTimeout(1500)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
    socket.connect(port, host)
  })
}

async function main() {
  const nodeArch = process.arch
  const hostArch = (process.env.PLAYWRIGHT_HOST_ARCH ?? nodeArch) === "arm64" ? "arm64" : "x64"
  const isMac = process.platform === "darwin"
  const useWebServerMode = process.env.PLAYWRIGHT_USE_WEBSERVER === "1"

  if (isMac && hostArch !== "arm64") {
    fail("ENV_BROWSER", "macOS local runs must use PLAYWRIGHT_HOST_ARCH=arm64")
  }

  const browsersBaseDir = resolveBrowsersBaseDir()
  const chromiumBinary = resolveChromiumBinary(browsersBaseDir, hostArch)
  if (!chromiumBinary) {
    fail(
      "ENV_BROWSER",
      `No Chromium binary found for arch=${hostArch} in ${browsersBaseDir}. Run npm run test:e2e:install`
    )
  }
  info(`Chromium binary: ${chromiumBinary}`)

  const reuseBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110"
  const webServerBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110"
  const expectedLocalE2EPort = Number(process.env.PLAYWRIGHT_LOCAL_E2E_PORT ?? 3110)

  if (!useWebServerMode) {
    const reuseUrl = new URL(reuseBaseUrl)
    const reusePort = Number(reuseUrl.port || (reuseUrl.protocol === "https:" ? 443 : 80))
    if (reusePort !== expectedLocalE2EPort) {
      fail(
        "ENV_MODE",
        `Local reuse must target the E2E server port ${expectedLocalE2EPort}, got ${reuseBaseUrl}. ` +
          "Use the local scripts or set PLAYWRIGHT_BASE_URL to the E2E port."
      )
    }
    const reachable = await canReachUrl(reuseBaseUrl)
    if (!reachable) {
      fail(
        "ENV_SERVER",
        `Local reuse mode cannot reach ${reuseBaseUrl}. ` +
          "Start the E2E server first (for example: npm run dev:e2e)."
      )
    }
    const bypassEnabled = await hasE2EBypassEnabled(reuseBaseUrl)
    if (!bypassEnabled) {
      fail(
        "ENV_SERVER",
        `Reuse target ${reuseBaseUrl} is reachable, but E2E auth bypass is disabled. ` +
          "Start the server with E2E_TEST enabled (for example: npm run dev:e2e)."
      )
    }
    info(`Reuse target reachable: ${reuseBaseUrl}`)
    info("Mode: local-reuse")
    info("Preflight OK")
    return
  }

  const targetBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? webServerBaseUrl
  const targetUrl = new URL(targetBaseUrl)
  const targetHost = targetUrl.hostname
  const targetPort = Number(targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80))

  if (targetPort !== expectedLocalE2EPort) {
    fail(
      "ENV_MODE",
      `Webserver mode must target E2E port ${expectedLocalE2EPort}, got ${targetBaseUrl}. ` +
        "Use PLAYWRIGHT_BASE_URL with the E2E port."
    )
  }
  const portAlreadyUsed = await isTcpPortInUse(targetHost, targetPort)
  if (portAlreadyUsed) {
    fail(
      "ENV_SERVER",
      `E2E port ${targetPort} is already in use (${targetBaseUrl}). ` +
        "Stop the process on that port or run in explicit reuse mode."
    )
  }
  const webServerCommand = process.env.PLAYWRIGHT_WEBSERVER_COMMAND ?? ""
  const usesNextDev =
    webServerCommand.includes("next dev") ||
    webServerCommand.includes("dev:e2e")
  if (usesNextDev) {
    const lockFile = path.resolve(process.cwd(), ".next/dev/lock")
    if (fs.existsSync(lockFile)) {
      warn(`Detected .next/dev/lock at ${lockFile}. Ensure no stale lock before webserver mode.`)
    }
  }

  info("Preflight OK")
}

await main()
