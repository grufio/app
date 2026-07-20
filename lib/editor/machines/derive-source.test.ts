import { describe, expect, it } from "vitest"

import { initialFilterReadModel, type FilterReadModel } from "@/lib/editor/filter-working-image"
import type { MasterImage } from "@/lib/editor/master-image"

import { deriveSource } from "./derive-source"

const master: MasterImage = {
  id: "m1",
  masterRowId: "m1",
  signedUrl: "u",
  masterSignedUrl: "u",
  width_px: 10,
  height_px: 10,
  dpi: null,
  name: "M",
  restore_base: null,
}

function loadedFilter(patch: Partial<FilterReadModel> = {}): FilterReadModel {
  return { ...initialFilterReadModel, loading: false, loadedOnce: true, ...patch }
}

describe("deriveSource", () => {
  it("is loading until the filter slice has loaded once", () => {
    expect(deriveSource({ master, masterLoading: false, masterError: "", filter: initialFilterReadModel }).status).toBe(
      "loading"
    )
    expect(
      deriveSource({ master, masterLoading: true, masterError: "", filter: loadedFilter() }).status
    ).toBe("loading")
  })

  it("is ready when the trace-free filter tip exists", () => {
    const out = deriveSource({
      master,
      masterLoading: false,
      masterError: "",
      filter: loadedFilter({
        imageWithoutTrace: {
          id: "f1",
          signedUrl: "u",
          width_px: 100,
          height_px: 200,
          storage_path: "p",
          source_image_id: null,
          name: "img",
          isFilterResult: false,
        },
      }),
    })
    expect(out.status).toBe("ready")
    if (out.status === "ready") expect(out.image?.id).toBe("f1")
  })

  it("returns empty for the explicit no_active_image contract", () => {
    const out = deriveSource({
      master,
      masterLoading: false,
      masterError: "",
      filter: loadedFilter({ emptyReason: "no_active_image" }),
    })
    expect(out).toEqual({ status: "empty", image: null, error: "" })
  })

  it("returns error for the unresolved technical state (master but no working image)", () => {
    const out = deriveSource({
      master,
      masterLoading: false,
      masterError: "",
      filter: loadedFilter({ emptyReason: null }),
    })
    expect(out.status).toBe("error")
    if (out.status === "error") {
      expect(out.error).toBe("Working image target is unresolved. Refresh editor state.")
    }
  })

  it("surfaces the filter error ahead of the master error", () => {
    const out = deriveSource({
      master,
      masterLoading: false,
      masterError: "master boom",
      filter: loadedFilter({ error: "filter boom" }),
    })
    expect(out).toEqual({ status: "error", image: null, error: "filter boom" })
  })

  it("is empty when there is no master at all", () => {
    const out = deriveSource({ master: null, masterLoading: false, masterError: "", filter: loadedFilter() })
    expect(out).toEqual({ status: "empty", image: null, error: "" })
  })
})
