import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { signInWithOAuthMock, createBrowserClientMock } = vi.hoisted(() => {
  const signInWithOAuthMock = vi.fn()
  const createBrowserClientMock = vi.fn(() => ({
    auth: { signInWithOAuth: signInWithOAuthMock },
  }))
  return { signInWithOAuthMock, createBrowserClientMock }
})

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createBrowserClientMock,
}))

import { signInWithGoogleOAuth } from "./oauth"

describe("signInWithGoogleOAuth", () => {
  beforeEach(() => {
    signInWithOAuthMock.mockReset().mockResolvedValue({ data: null, error: null })
    createBrowserClientMock.mockClear()
    vi.stubGlobal("window", { location: { origin: "https://app.example.com" } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses the provided redirectTo when same-origin /auth/callback", async () => {
    await signInWithGoogleOAuth({ redirectTo: "https://app.example.com/auth/callback" })
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://app.example.com/auth/callback" },
    })
  })

  it("falls back to safe callback when redirectTo is cross-origin", async () => {
    await signInWithGoogleOAuth({ redirectTo: "https://evil.com/auth/callback" })
    const arg = signInWithOAuthMock.mock.calls[0]?.[0]
    expect(arg.options.redirectTo).toBe("https://app.example.com/auth/callback")
  })

  it("falls back when redirectTo points to a different path on same origin", async () => {
    await signInWithGoogleOAuth({ redirectTo: "https://app.example.com/some/other/path" })
    const arg = signInWithOAuthMock.mock.calls[0]?.[0]
    expect(arg.options.redirectTo).toBe("https://app.example.com/auth/callback")
  })

  it("falls back when redirectTo is not a valid URL", async () => {
    await signInWithGoogleOAuth({ redirectTo: "not-a-url" })
    const arg = signInWithOAuthMock.mock.calls[0]?.[0]
    expect(arg.options.redirectTo).toBe("https://app.example.com/auth/callback")
  })
})
