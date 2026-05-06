import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getOptionalEnv, getOptionalPositiveIntEnv, getRequiredEnv } from "./env"

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
})
