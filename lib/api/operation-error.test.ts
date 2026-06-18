import { describe, expect, it } from "vitest"

import {
  isOperationError,
  mapPgErrorCodeToReason,
  pgErrorToOperationError,
} from "./operation-error"

describe("isOperationError", () => {
  it("accepts a minimum-shape object", () => {
    expect(isOperationError({ stage: "validation", message: "Bad input" })).toBe(true)
  })

  it("accepts the full shape", () => {
    expect(
      isOperationError({
        stage: "rpc_call",
        reason: "check_violation",
        code: "P0001",
        correlationId: "abc-123",
        message: "Bad input",
      }),
    ).toBe(true)
  })

  it("rejects null, undefined, primitives", () => {
    expect(isOperationError(null)).toBe(false)
    expect(isOperationError(undefined)).toBe(false)
    expect(isOperationError("oops")).toBe(false)
    expect(isOperationError(42)).toBe(false)
  })

  it("rejects objects missing required fields", () => {
    expect(isOperationError({ stage: "x" })).toBe(false)
    expect(isOperationError({ message: "x" })).toBe(false)
    expect(isOperationError({ stage: 1, message: "x" })).toBe(false)
  })
})

describe("mapPgErrorCodeToReason", () => {
  it("maps the documented codes", () => {
    expect(mapPgErrorCodeToReason("23503")).toBe("fk_violation")
    expect(mapPgErrorCodeToReason("23505")).toBe("unique_violation")
    expect(mapPgErrorCodeToReason("23514")).toBe("check_violation")
    expect(mapPgErrorCodeToReason("23502")).toBe("not_null_violation")
    expect(mapPgErrorCodeToReason("55P03")).toBe("lock_timeout")
    expect(mapPgErrorCodeToReason("40001")).toBe("serialization_failure")
    expect(mapPgErrorCodeToReason("P0001")).toBe("raise_exception")
    expect(mapPgErrorCodeToReason("42501")).toBe("rls_denied")
  })

  it("returns undefined for unknown / empty codes", () => {
    expect(mapPgErrorCodeToReason(undefined)).toBeUndefined()
    expect(mapPgErrorCodeToReason(null)).toBeUndefined()
    expect(mapPgErrorCodeToReason("")).toBeUndefined()
    expect(mapPgErrorCodeToReason("99999")).toBeUndefined()
  })
})

describe("pgErrorToOperationError", () => {
  it("returns a canonical OperationError when given a PostgrestError-like object", () => {
    const out = pgErrorToOperationError(
      { message: "image_id must be a live master image", code: "23514" },
      "rpc_call",
    )
    expect(out).toEqual({
      stage: "rpc_call",
      reason: "check_violation",
      code: "23514",
      message: "image_id must be a live master image",
    })
  })

  it("falls back when the code is unmapped", () => {
    const out = pgErrorToOperationError(
      { message: "weird DB error", code: "99999" },
      "rpc_call",
    )
    expect(out).toEqual({
      stage: "rpc_call",
      reason: undefined,
      code: "99999",
      message: "weird DB error",
    })
  })

  it("uses fallback message when input is null / undefined / non-object", () => {
    expect(pgErrorToOperationError(null, "rpc")).toEqual({ stage: "rpc", message: "Database error" })
    expect(pgErrorToOperationError(undefined, "rpc")).toEqual({ stage: "rpc", message: "Database error" })
    expect(pgErrorToOperationError("oops", "rpc")).toEqual({ stage: "rpc", message: "Database error" })
  })

  it("uses provided fallbackMessage on non-string upstream message", () => {
    const out = pgErrorToOperationError({ message: 42 }, "rpc", "Custom fallback")
    expect(out.message).toBe("Custom fallback")
  })
})
