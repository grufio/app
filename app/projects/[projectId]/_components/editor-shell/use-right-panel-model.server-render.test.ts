import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { useRightPanelModel } from "./use-right-panel-model"

function decodeMarkupJson(raw: string): string {
  return raw
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

describe("useRightPanelModel", () => {
  it("derives image section model from selected image nav", () => {
    function Probe() {
      const out = useRightPanelModel({
        selectedNavId: "app/api/img-1",
        imageStateLoading: false,
        imagePxU: { w: 123n, h: 456n },
        initialImagePxU: null,
        workspaceLoading: false,
        workspaceUnit: "cm",
        masterImage: { signedUrl: "u", name: "Master" },
        projectImages: [{ id: "img-1", name: "Image One" }],
        selectedImageId: "img-1",
        lockedImageById: { "img-1": true },
      })

      const serializable = {
        activeRightSection: out.activeRightSection,
        imagePanelLocked: out.imagePanelLocked,
        panelImageName: out.panelImageMeta?.name ?? null,
        panelImagePxU: out.panelImagePxU ? { w: String(out.panelImagePxU.w), h: String(out.panelImagePxU.h) } : null,
      }
      return React.createElement("pre", null, JSON.stringify(serializable))
    }

    const html = renderToStaticMarkup(React.createElement(Probe))
    const json = decodeMarkupJson(html).replace(/^<pre>/, "").replace(/<\/pre>$/, "")
    const parsed = JSON.parse(json) as {
      activeRightSection: string
      imagePanelLocked: boolean
      panelImageName: string | null
      panelImagePxU: { w: string; h: string } | null
    }

    expect(parsed.activeRightSection).toBe("image")
    expect(parsed.imagePanelLocked).toBe(true)
    expect(parsed.panelImageName).toBe("Image One")
    expect(parsed.panelImagePxU).toEqual({ w: "123", h: "456" })
  })
})
