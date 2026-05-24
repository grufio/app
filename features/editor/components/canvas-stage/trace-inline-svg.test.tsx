/**
 * @vitest-environment jsdom
 *
 * Pixel-measurement test for the trace overlay layer.
 *
 * It renders the real `TraceInlineSvg` and reads back the absolute inline
 * `style.left/top/width/height` the browser would use to position it. Those
 * four numbers ARE the rendered trace layer — there is no other positioning
 * input. Contract under test: the component renders at EXACTLY the rect it is
 * handed (no clamping, no aspect snapping), with `imageRect.x/y` treated as a
 * centre. WHICH rect that is — position following the live image, size frozen
 * on `display_*` — is decided upstream in `resolveTraceOverlayRect`
 * (see its tests + `trace-overlay-aspect.spec.ts`), not here.
 *
 * The rect fixture mirrors the prod project 2d15eeeb (read-only psql):
 * `project_image_state` 283.464567 × 566.929134 px at world-centre
 * (297.5, 421.0).
 */
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TraceInlineSvg } from "./trace-inline-svg"

const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="283" height="567" viewBox="0 0 283 567">
  <path d="M 0 0 L 50 0 L 50 30 Z" fill="#ff0000"/>
</svg>`

/** Read the absolute box the component committed to the DOM. */
function measure(el: HTMLElement) {
  const node = el.querySelector<HTMLElement>('[data-testid="trace-inline-svg"]')
  if (!node) throw new Error("trace overlay did not render")
  return {
    left: Number.parseFloat(node.style.left),
    top: Number.parseFloat(node.style.top),
    width: Number.parseFloat(node.style.width),
    height: Number.parseFloat(node.style.height),
  }
}

describe("TraceInlineSvg — rendered geometry (pixels)", () => {
  // view = identity (scale 1, no pan): world px == screen px, so the
  // measured box is the world rect directly. `imageRect.x/y` is a CENTER,
  // so left = x - width/2, top = y - height/2.
  const view = { scale: 1, x: 0, y: 0 }

  it("renders at exactly the rect it is handed (its own display geometry)", () => {
    const { container } = render(
      <TraceInlineSvg
        svgText={SVG}
        imageRect={{ x: 297.5, y: 421, width: 283.464567, height: 566.929134 }}
        view={view}
      />,
    )
    const box = measure(container)
    expect(box.width).toBeCloseTo(283.464567, 4)
    expect(box.height).toBeCloseTo(566.929134, 4)
    expect(box.left).toBeCloseTo(297.5 - 283.464567 / 2, 4)
    expect(box.top).toBeCloseTo(421 - 566.929134 / 2, 4)
  })
})
