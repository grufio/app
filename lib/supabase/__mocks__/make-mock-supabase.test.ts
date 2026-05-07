import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "./make-mock-supabase"

describe("makeMockSupabase", () => {
  it("from(table).select()...await resolves to configured rows", async () => {
    const supabase = makeMockSupabase({
      tables: { project_images: { select: { data: [{ id: "img-1" }], error: null } } },
    })
    const { data, error } = await supabase.from("project_images").select("*").eq("id", "img-1").is("deleted_at", null)
    expect(error).toBeNull()
    expect(data).toEqual([{ id: "img-1" }])
  })

  it("returns the same chain shape regardless of which filter methods the caller chains", async () => {
    const supabase = makeMockSupabase({
      tables: { project_images: { select: { data: [], error: null } } },
    })
    // Variations the production code uses today — each must resolve.
    await supabase.from("project_images").select().eq("id", "x")
    await supabase.from("project_images").select().is("deleted_at", null)
    await supabase.from("project_images").select().in("id", ["a", "b"])
    await supabase.from("project_images").select().like("name", "%x%")
    await supabase.from("project_images").select().order("created_at")
    await supabase.from("project_images").select().limit(10)
    // Compound: eq().eq().is().order().limit()
    await supabase
      .from("project_images")
      .select()
      .eq("id", "x")
      .eq("project_id", "p")
      .is("deleted_at", null)
      .order("created_at")
      .limit(5)
  })

  it("supports .maybeSingle() / .single() terminals", async () => {
    const supabase = makeMockSupabase({
      tables: { project_images: { select: { data: { id: "x" }, error: null } } },
    })
    const m = await supabase.from("project_images").select().eq("id", "x").maybeSingle()
    expect(m.data).toEqual({ id: "x" })
    const s = await supabase.from("project_images").select().eq("id", "x").single()
    expect(s.data).toEqual({ id: "x" })
  })

  it("propagates configured errors", async () => {
    const supabase = makeMockSupabase({
      tables: { project_images: { select: { error: { message: "boom", code: "X" } } } },
    })
    const { data, error } = await supabase.from("project_images").select().eq("id", "x")
    expect(data).toBeNull()
    expect(error).toEqual({ message: "boom", code: "X" })
  })

  it("storage.from(bucket) returns mock with upload/download/remove/createSignedUrl", async () => {
    const supabase = makeMockSupabase({
      storage: {
        project_images: {
          createSignedUrl: { data: { signedUrl: "https://signed/x.jpg" }, error: null },
          download: { data: new Blob([new Uint8Array([1, 2, 3])]), error: null },
        },
      },
    })
    const signed = await supabase.storage.from("project_images").createSignedUrl("path", 60)
    expect(signed.data?.signedUrl).toBe("https://signed/x.jpg")
    const dl = await supabase.storage.from("project_images").download("path")
    expect(dl.data).toBeInstanceOf(Blob)
    // Methods we didn't configure return success-with-null
    const removed = await supabase.storage.from("project_images").remove(["path"])
    expect(removed.error).toBeNull()
  })

  it("rpc(name) returns the configured rpc result", async () => {
    const supabase = makeMockSupabase({
      rpcs: {
        delete_project: { data: "ok", error: null },
        set_active_image: { error: { message: "bad" } },
      },
    })
    const ok = await supabase.rpc("delete_project", { p_project_id: "x" })
    expect(ok.data).toBe("ok")
    const broken = await supabase.rpc("set_active_image", { p_project_id: "x", p_image_id: "y" })
    expect(broken.error).toEqual({ message: "bad" })
  })

  it("invokes onCall with the recorded chain ops + args", async () => {
    const onCall = vi.fn()
    const supabase = makeMockSupabase({
      tables: { project_images: { update: { data: null, error: null, onCall } } },
    })
    await supabase
      .from("project_images")
      .update({ name: "new" })
      .eq("id", "abc")
      .is("deleted_at", null)
    expect(onCall).toHaveBeenCalledTimes(1)
    const call = onCall.mock.calls[0]?.[0]
    expect(call?.ops).toEqual(["update", "eq", "is"])
    expect(call?.args).toEqual([
      ["id", "abc"],
      ["deleted_at", null],
    ])
  })
})
