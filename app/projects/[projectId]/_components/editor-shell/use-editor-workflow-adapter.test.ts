import { describe, expect, it } from "vitest"

import { deriveEditorSourceSnapshot } from "./use-editor-workflow-adapter"

describe("deriveEditorSourceSnapshot", () => {
  it("returns empty for explicit no_active_image contract", () => {
    const out = deriveEditorSourceSnapshot({
      masterImageLoading: false,
      filterImageLoading: false,
      uploadSyncing: false,
      filterImageLoadedOnce: true,
      filterDisplayImage: null,
      filterImageError: "",
      masterImageError: "",
      masterImage: { id: "m1" },
      filterImageEmptyReason: "no_active_image",
    })
    expect(out).toEqual({ status: "empty", image: null, error: "" })
  })

  it("returns error for unresolved technical state", () => {
    const out = deriveEditorSourceSnapshot({
      masterImageLoading: false,
      filterImageLoading: false,
      uploadSyncing: false,
      filterImageLoadedOnce: true,
      filterDisplayImage: null,
      filterImageError: "",
      masterImageError: "",
      masterImage: { id: "m1" },
      filterImageEmptyReason: null,
    })
    expect(out.status).toBe("error")
    if (out.status === "error") {
      expect(out.error).toBe("Working image target is unresolved. Refresh editor state.")
    }
  })

  it("returns ready when filter display image exists", () => {
    const out = deriveEditorSourceSnapshot({
      masterImageLoading: false,
      filterImageLoading: false,
      uploadSyncing: false,
      filterImageLoadedOnce: true,
      filterDisplayImage: { id: "f1", signedUrl: "u", width_px: 100, height_px: 200, name: "img" },
      filterImageError: "",
      masterImageError: "",
      masterImage: { id: "m1" },
      filterImageEmptyReason: null,
    })
    expect(out.status).toBe("ready")
  })
})

