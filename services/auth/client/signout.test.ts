import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { signOutMock, createBrowserClientMock } = vi.hoisted(() => {
  const signOutMock = vi.fn()
  const createBrowserClientMock = vi.fn(() => ({
    auth: { signOut: signOutMock },
  }))
  return { signOutMock, createBrowserClientMock }
})

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createBrowserClientMock,
}))

import { signOutClient } from "./signout"

describe("signOutClient", () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    signOutMock.mockReset().mockResolvedValue({ error: null })
    createBrowserClientMock.mockClear()
    assignSpy = vi.fn()
    vi.stubGlobal("window", { location: { assign: assignSpy } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("calls supabase signOut and navigates to /login by default", async () => {
    await signOutClient()
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(assignSpy).toHaveBeenCalledWith("/login")
  })

  it("respects the provided redirectTo", async () => {
    await signOutClient({ redirectTo: "/dashboard" })
    expect(assignSpy).toHaveBeenCalledWith("/dashboard")
  })

  it("navigates after signOut resolves (order)", async () => {
    const calls: string[] = []
    signOutMock.mockImplementationOnce(async () => {
      calls.push("signOut")
      return { error: null }
    })
    assignSpy.mockImplementation(() => {
      calls.push("assign")
    })
    await signOutClient()
    expect(calls).toEqual(["signOut", "assign"])
  })
})
