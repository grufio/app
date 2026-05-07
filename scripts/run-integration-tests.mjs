#!/usr/bin/env node
/**
 * CI entry-point for the integration test suite.
 *
 * What it does:
 *   1. Boots local Supabase via `supabase start` (idempotent).
 *   2. Reads the service-role key + API URL from `supabase status -o env`.
 *   3. Exports them to the test process as
 *      SUPABASE_INTEGRATION_URL / SUPABASE_INTEGRATION_SERVICE_KEY
 *      (kept namespaced so they can't leak into prod-side code).
 *   4. Runs the integration vitest config.
 *
 * Designed to also work locally — re-running is safe; if Supabase is
 * already up the start step is a no-op.
 *
 * Exits non-zero on any step failure so CI fails the job.
 */
import { execSync, spawnSync } from "node:child_process"

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts })
  if (res.status !== 0) {
    process.exit(res.status ?? 1)
  }
}

function captureEnv() {
  const out = execSync("supabase status -o env", { encoding: "utf8" })
  const env = {}
  for (const line of out.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/i.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
  return env
}

console.log("[integration] Bringing up local Supabase…")
run("supabase", ["start"])

console.log("[integration] Capturing connection details…")
const env = captureEnv()
const url = env.API_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error("[integration] Could not read URL / service-role key from `supabase status`.")
  console.error("[integration] Got keys:", Object.keys(env).join(", "))
  process.exit(1)
}

console.log(`[integration] Running tests against ${url}`)
run("npx", ["vitest", "run", "--config", "vitest.integration.config.ts"], {
  env: {
    ...process.env,
    SUPABASE_INTEGRATION_URL: url,
    SUPABASE_INTEGRATION_SERVICE_KEY: serviceKey,
  },
})
