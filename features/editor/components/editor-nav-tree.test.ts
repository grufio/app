import { describe, expect, it } from "vitest"

import { buildNavId } from "@/features/editor/navigation/nav-id"
import { buildEditorNavTreeData, resolveEditorNavSelectedItemId } from "./editor-nav-tree"

describe("EditorNavTree", () => {
  it("keeps controlled selection when selected id exists in tree data", () => {
    const data = buildEditorNavTreeData([{ id: "img-1", label: "Image 1" }])
    const selectedId = buildNavId({ kind: "image", imageId: "img-1" })
    expect(resolveEditorNavSelectedItemId(selectedId, data)).toBe(selectedId)
  })

  it("clears controlled selection when selected id no longer exists", () => {
    const data = buildEditorNavTreeData([{ id: "img-1", label: "Image 1" }])
    const staleSelectedId = buildNavId({ kind: "image", imageId: "img-2" })
    expect(resolveEditorNavSelectedItemId(staleSelectedId, data)).toBeNull()
  })
})
