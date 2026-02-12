/**
 * E2E test mode helpers (server-only gate).
 *
 * Responsibilities:
 * - Provide a single source of truth for enabling E2E-only bypass behavior.
 * - Ensure headers alone can never enable bypass in non-test environments.
 *
 * Policy (MVP):
 * - `E2E_TEST=1` enables E2E-mode. Otherwise E2E-mode is OFF.
 * - `x-e2e-test: 1` is treated as a signal only when E2E-mode is enabled.
 */

export function isE2ETestEnv(): boolean {
  return process.env.E2E_TEST === "1"
}

export function isE2ETestRequest(headers: Headers): boolean {
  if (!isE2ETestEnv()) return false
  return headers.get("x-e2e-test") === "1"
}

export function isE2EUserSimulated(headers: Headers): boolean {
  if (!isE2ETestEnv()) return false
  return headers.get("x-e2e-user") === "1"
}

