import { beforeEach, describe, expect, it, vi } from "vitest"

const { signInWithPasswordMock, createBrowserClientMock } = vi.hoisted(() => {
  const signInWithPasswordMock = vi.fn()
  const createBrowserClientMock = vi.fn(() => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }))
  return { signInWithPasswordMock, createBrowserClientMock }
})

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createBrowserClientMock,
}))

import { signInWithPassword } from "./password"

describe("signInWithPassword", () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset()
    createBrowserClientMock.mockClear()
  })

  it("returns ok=true when supabase succeeds", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null })
    const result = await signInWithPassword({ email: "user@example.com", password: "pw" })
    expect(result).toEqual({ ok: true })
    expect(signInWithPasswordMock).toHaveBeenCalledWith({ email: "user@example.com", password: "pw" })
  })

  it("returns ok=false with the supabase error message", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({ data: null, error: { message: "Invalid login credentials" } })
    const result = await signInWithPassword({ email: "u@x.com", password: "wrong" })
    expect(result).toEqual({ ok: false, error: "Invalid login credentials" })
  })

  it("creates a fresh browser client per call", async () => {
    signInWithPasswordMock.mockResolvedValue({ data: null, error: null })
    await signInWithPassword({ email: "a@x.com", password: "1" })
    await signInWithPassword({ email: "b@x.com", password: "2" })
    expect(createBrowserClientMock).toHaveBeenCalledTimes(2)
  })
})
