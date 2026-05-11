import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { useLeftPanelModel } from "./use-left-panel-model"

function decodeMarkupJson(raw: string): string {
  return raw
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

describe("useLeftPanelModel", () => {
  it("derives selected image and left list", () => {
    function Probe() {
      const out = useLeftPanelModel({
        selectedNavId: "app/api/img-2",
        setSelectedNavId: vi.fn(),
        projectImages: [
          { id: "img-1", name: "First" },
          { id: "img-2", name: "Second" },
        ],
        setDeleteError: vi.fn(),
        setDeleteOpen: vi.fn(),
        createGrid: vi.fn(async () => null),
        deleteGrid: vi.fn(async () => true),
      })

      const serializable = {
        selectedImageId: out.selectedImageId,
        leftPanelImages: out.leftPanelImages,
      }
      return React.createElement("pre", null, JSON.stringify(serializable))
    }

    const html = renderToStaticMarkup(React.createElement(Probe))
    const json = decodeMarkupJson(html).replace(/^<pre>/, "").replace(/<\/pre>$/, "")
    const parsed = JSON.parse(json) as {
      selectedImageId: string | null
      leftPanelImages: Array<{ id: string; label: string }>
    }

    expect(parsed.selectedImageId).toBe("img-2")
    expect(parsed.leftPanelImages).toEqual([
      { id: "img-1", label: "First" },
      { id: "img-2", label: "Second" },
    ])
  })
})
