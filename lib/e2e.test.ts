/**
 * Unit tests for E2E gating helpers.
 */
import { describe, expect, it } from "vitest"

import { isE2ETestEnv, isE2ETestRequest, isE2EUserSimulated } from "./e2e"

describe("e2e env gating", () => {
  it("does not enable bypass when E2E_TEST is unset", () => {
    const prev = process.env.E2E_TEST
    try {
      delete process.env.E2E_TEST
      expect(isE2ETestEnv()).toBe(false)
      expect(isE2ETestRequest(new Headers({ "x-e2e-test": "1" }))).toBe(false)
      expect(isE2EUserSimulated(new Headers({ "x-e2e-user": "1" }))).toBe(false)
    } finally {
      if (prev == null) delete process.env.E2E_TEST
      else process.env.E2E_TEST = prev
    }
  })

  it("enables request/user signals only when E2E_TEST=1", () => {
    const prev = process.env.E2E_TEST
    try {
      process.env.E2E_TEST = "1"
      expect(isE2ETestEnv()).toBe(true)
      expect(isE2ETestRequest(new Headers({ "x-e2e-test": "1" }))).toBe(true)
      expect(isE2EUserSimulated(new Headers({ "x-e2e-user": "1" }))).toBe(true)
      expect(isE2ETestRequest(new Headers({}))).toBe(false)
      expect(isE2EUserSimulated(new Headers({}))).toBe(false)
    } finally {
      if (prev == null) delete process.env.E2E_TEST
      else process.env.E2E_TEST = prev
    }
  })
})

