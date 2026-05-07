import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reportClientError } from "./with-error-reporting"

// Spy on the underlying reportError so we don't actually fire an ingest
// POST. The helper's contract is "delegate to reportError with sensible
// defaults" — that's all we need to verify.
vi.mock("./error-reporting", () => ({
  reportError: vi.fn(async () => {}),
}))

import { reportError } from "./error-reporting"

const reportErrorMock = vi.mocked(reportError)

describe("reportClientError", () => {
  beforeEach(() => {
    reportErrorMock.mockClear()
  })

  afterEach(() => {
    reportErrorMock.mockClear()
  })

  it("forwards the error and context to reportError", () => {
    const err = new Error("boom")
    reportClientError(err, {
      scope: "editor",
      code: "FOO_FAILED",
      stage: "load",
      context: { projectId: "p-1" },
    })
    expect(reportErrorMock).toHaveBeenCalledTimes(1)
    expect(reportErrorMock).toHaveBeenCalledWith(err, {
      scope: "editor",
      code: "FOO_FAILED",
      stage: "load",
      severity: "warn",
      context: { projectId: "p-1" },
      tags: undefined,
    })
  })

  it("defaults severity to 'warn' when caller omits it", () => {
    reportClientError(new Error("x"), { scope: "client", code: "X" })
    expect(reportErrorMock.mock.calls[0]?.[1]?.severity).toBe("warn")
  })

  it("respects an explicit severity override", () => {
    reportClientError(new Error("x"), { scope: "client", code: "X", severity: "error" })
    expect(reportErrorMock.mock.calls[0]?.[1]?.severity).toBe("error")
  })

  it("passes non-Error inputs through (reportError handles coercion)", () => {
    reportClientError("plain string", { scope: "editor", code: "STR_FAIL" })
    expect(reportErrorMock).toHaveBeenCalledWith("plain string", expect.objectContaining({ scope: "editor" }))
  })

  it("returns synchronously (fire-and-forget)", () => {
    const result = reportClientError(new Error("x"), { scope: "editor", code: "X" })
    // Helper returns void — the ingest POST happens asynchronously inside
    // reportError. The caller's catch block must not have to await.
    expect(result).toBeUndefined()
  })
})
