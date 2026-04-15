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
        imageTransformPxU: { x: 11n, y: 22n, w: 123n, h: 456n },
        initialImageTransformPxU: null,
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
        imagePanelState: out.imagePanelState,
        panelImageName: out.panelImageMeta?.name ?? null,
        panelImagePxU: out.panelImagePxU ? { w: String(out.panelImagePxU.w), h: String(out.panelImagePxU.h) } : null,
        panelImagePosPxU: out.panelImagePosPxU ? { x: String(out.panelImagePosPxU.x), y: String(out.panelImagePosPxU.y) } : null,
      }
      return React.createElement("pre", null, JSON.stringify(serializable))
    }

    const html = renderToStaticMarkup(React.createElement(Probe))
    const json = decodeMarkupJson(html).replace(/^<pre>/, "").replace(/<\/pre>$/, "")
    const parsed = JSON.parse(json) as {
      activeRightSection: string
      imagePanelLocked: boolean
      imagePanelState: string
      panelImageName: string | null
      panelImagePxU: { w: string; h: string } | null
      panelImagePosPxU: { x: string; y: string } | null
    }

    expect(parsed.activeRightSection).toBe("image")
    expect(parsed.imagePanelLocked).toBe(true)
    expect(parsed.imagePanelState).toBe("ready")
    expect(parsed.panelImageName).toBe("Image One")
    expect(parsed.panelImagePxU).toEqual({ w: "123", h: "456" })
    expect(parsed.panelImagePosPxU).toEqual({ x: "11", y: "22" })
  })

  it("returns no_state when transform state is missing", () => {
    function Probe() {
      const out = useRightPanelModel({
        selectedNavId: "app/api/img-1",
        imageStateLoading: false,
        imageTransformPxU: null,
        initialImageTransformPxU: null,
        workspaceLoading: false,
        workspaceUnit: "cm",
        masterImage: { signedUrl: "u", name: "Master", width_px: 12, height_px: 8 },
        projectImages: [{ id: "img-1", name: "Image One" }],
        selectedImageId: "img-1",
        lockedImageById: {},
      })

      const serializable = {
        imagePanelState: out.imagePanelState,
        panelImagePxU: out.panelImagePxU ? { w: String(out.panelImagePxU.w), h: String(out.panelImagePxU.h) } : null,
        panelImagePosPxU: out.panelImagePosPxU ? { x: String(out.panelImagePosPxU.x), y: String(out.panelImagePosPxU.y) } : null,
      }
      return React.createElement("pre", null, JSON.stringify(serializable))
    }

    const html = renderToStaticMarkup(React.createElement(Probe))
    const json = decodeMarkupJson(html).replace(/^<pre>/, "").replace(/<\/pre>$/, "")
    const parsed = JSON.parse(json) as {
      imagePanelState: string
      panelImagePxU: { w: string; h: string } | null
      panelImagePosPxU: { x: string; y: string } | null
    }

    expect(parsed.imagePanelState).toBe("no_state")
    expect(parsed.panelImagePxU).toBeNull()
    expect(parsed.panelImagePosPxU).toBeNull()
  })
})
