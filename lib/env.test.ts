import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getOptionalEnv, getOptionalPositiveIntEnv, getRequiredEnv, getRequiredPublicEnv } from "./env"

const TEST_VAR = "__GRUF_ENV_TEST__"

describe("env helpers", () => {
  const original = process.env[TEST_VAR]

  beforeEach(() => {
    delete process.env[TEST_VAR]
  })

  afterEach(() => {
    if (original == null) delete process.env[TEST_VAR]
    else process.env[TEST_VAR] = original
  })

  it("getRequiredEnv returns the value when set", () => {
    process.env[TEST_VAR] = "hello"
    expect(getRequiredEnv(TEST_VAR)).toBe("hello")
  })

  it("getRequiredEnv throws with an actionable message when missing", () => {
    expect(() => getRequiredEnv(TEST_VAR)).toThrow(/Missing required environment variable: __GRUF_ENV_TEST__/)
  })

  it("getRequiredEnv treats empty string as missing", () => {
    process.env[TEST_VAR] = ""
    expect(() => getRequiredEnv(TEST_VAR)).toThrow()
  })

  it("getOptionalEnv returns null on missing or empty", () => {
    expect(getOptionalEnv(TEST_VAR)).toBeNull()
    process.env[TEST_VAR] = ""
    expect(getOptionalEnv(TEST_VAR)).toBeNull()
    process.env[TEST_VAR] = "x"
    expect(getOptionalEnv(TEST_VAR)).toBe("x")
  })

  it("getOptionalPositiveIntEnv parses positive integers, rejects others", () => {
    expect(getOptionalPositiveIntEnv(TEST_VAR)).toBeNull()
    process.env[TEST_VAR] = "42"
    expect(getOptionalPositiveIntEnv(TEST_VAR)).toBe(42)
    process.env[TEST_VAR] = "0"
    expect(getOptionalPositiveIntEnv(TEST_VAR)).toBeNull()
    process.env[TEST_VAR] = "-5"
    expect(getOptionalPositiveIntEnv(TEST_VAR)).toBeNull()
    process.env[TEST_VAR] = "1.5"
    expect(getOptionalPositiveIntEnv(TEST_VAR)).toBeNull()
    process.env[TEST_VAR] = "abc"
    expect(getOptionalPositiveIntEnv(TEST_VAR)).toBeNull()
  })

  it("getRequiredPublicEnv reads each known key via literal access", () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test"
      expect(getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL")).toBe("https://example.supabase.co")
      expect(getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("anon-test")
    } finally {
      if (originalUrl == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
      if (originalKey == null) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
    }
  })

  it("getRequiredPublicEnv throws when a key is missing/empty", () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      expect(() => getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL")).toThrow(
        /Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL/,
      )
      process.env.NEXT_PUBLIC_SUPABASE_URL = ""
      expect(() => getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL")).toThrow()
    } finally {
      if (original == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = original
    }
  })
})

/**
 * Static gate: any module that ships to the browser bundle must read
 * NEXT_PUBLIC_* via `getRequiredPublicEnv` (literal access, bundler-
 * inlinable) — never `getRequiredEnv("NEXT_PUBLIC_*")` whose dynamic
 * `process.env[name]` lookup ships as `undefined` to the browser.
 *
 * Regression caught: 2026-05-06 — `lib/supabase/browser.ts` used the
 * dynamic helper and broke logout (signOutClient → throw).
 */
describe("browser-bundle env access (regression gate)", () => {
  const browserSafeFiles = [
    "lib/supabase/browser.ts",
  ]

  it.each(browserSafeFiles)(
    "%s does not call getRequiredEnv with a NEXT_PUBLIC_ literal",
    (relativePath) => {
      const src = readFileSync(resolve(process.cwd(), relativePath), "utf8")
      // Match getRequiredEnv("NEXT_PUBLIC_…") or getRequiredEnv('NEXT_PUBLIC_…')
      expect(src).not.toMatch(/getRequiredEnv\(\s*["']NEXT_PUBLIC_/)
    },
  )
})
