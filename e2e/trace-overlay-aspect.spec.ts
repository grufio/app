/**
 * Assert C — the post-apply trace-OVERLAY aspect gate (the render gate
 * that was missing for ~30 PRs; arch_pixelate-why-complex §4.1, and the
 * stage-3 target in ertelle-plan-dazu-squishy-moler §3).
 *
 * The bug class: the applied pixelate overlay rendered in the proportion
 * of `imageTx` (the live canvas transform), not the size that was
 * authoritative when the trace was applied. With `preserveAspectRatio=
 * "none"` the near-square SVG was stretched onto whatever aspect the
 * overlay CONTAINER had — and the container was sized from `imageTx`, so a
 * 6×6 grid on a portrait resize came out stretched.
 *
 * Stage 3 decouples the overlay's SIZE/ASPECT from `imageTx`: it is frozen
 * from the trace's own `display_*_px_u` (persisted at apply time, stage 2).
 * This spec proves that decoupling end-to-end:
 *
 *   1. Resize the base image to a clear PORTRAIT (8×15 cm → aspect ≈ 0.53)
 *      so the live `imageTx` aspect is unmistakably NOT the frozen rect.
 *   2. Trace tab → Pixelate → Apply. The mock freezes a 2:1 LANDSCAPE
 *      display rect onto the trace row (display_width/height = 400/200 px
 *      µpx) and serves a NEAR-SQUARE (101×98) overlay SVG.
 *   3. Assert C-1: the rendered overlay container aspect ≈ 2.0 (the frozen
 *      rect) — NOT ≈ 0.53 (the live imageTx) and NOT ≈ 1.03 (the SVG
 *      viewBox). Pre-fix the container came from `imageRender` → this is
 *      where it failed (it would read ≈ 0.53).
 *   4. Assert C-2: after a SECOND resize of the base image (to a square),
 *      the overlay aspect STAYS ≈ 2.0 — only the SIZE/ASPECT is frozen on
 *      `display_*`; it does not follow later imageTx SIZE changes. (Since
 *      #285 the overlay POSITION does follow the image; this spec measures
 *      the aspect ratio, which the position can't affect.)
 *
 * Why the CONTAINER aspect (not the SVG viewBox) is the load-bearing
 * signal: the SVG fills its wrapper with `width/height: 100%` +
 * `preserveAspectRatio="none"`, so its own near-square viewBox is
 * irrelevant — the rendered aspect IS the container's. We read the
 * container's bounding box (uniform stage scale → box aspect = world-rect
 * aspect). See review_plan_pixelate-aspect §C.
 */
import { expect, test, type Page } from "@playwright/test"

import { PROJECT_ID, setupMockRoutes } from "./_mocks"

// First resize: a clear portrait, the inverse of the frozen 2:1 landscape
// rect, so a leaked imageTx aspect is unmistakable.
const RESIZE_1_W_CM = "8"
const RESIZE_1_H_CM = "15"
// The trace mock freezes display_width/height = 400/200 px → 2:1.
const FROZEN_ASPECT = 2.0

async function bootEditorWithMaster(page: Page) {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })
  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByTestId("editor-canvas-root")).toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(() => Boolean((globalThis as { __gruf_editor?: { image?: unknown } }).__gruf_editor?.image)),
    )
    .toBe(true)
}

async function resizeImage(page: Page, wCm: string, hCm: string) {
  // Resize requires the Image node, which is only in the layer tree on the
  // Image tab. Switch there first (the overlay only renders on the Trace
  // tab anyway, so callers return to Trace afterwards to re-measure).
  await page.getByRole("tab", { name: "Image" }).click()
  const layers = page.getByRole("complementary", { name: "Layers" })
  await expect(layers).toBeVisible()
  await layers.getByRole("button", { name: "Image", exact: true }).first().click()
  const w = page.getByLabel(/Image width/i)
  const h = page.getByLabel(/Image height/i)
  await expect(w).toBeEnabled()
  await expect(h).toBeEnabled()
  await w.fill(wCm)
  await h.fill(hCm)
  await h.press("Enter")
  await expect(w).toHaveValue(wCm)
  await expect(h).toHaveValue(hCm)
}

async function applyPixelate(page: Page) {
  await page.getByRole("tab", { name: "Trace" }).click()
  await page.getByRole("button", { name: "Add trace" }).click()
  await page.getByRole("button", { name: "Pixelate", exact: true }).click()
  await page.getByRole("button", { name: "Select", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Pixelate" })
  await expect(dialog).toBeVisible()
  // Apply the trace. The footer button label is "Apply".
  await dialog.getByRole("button", { name: /^Apply/ }).click()
}

/** Read the rendered overlay container's aspect (width/height of its
 * bounding box). Uniform stage scale → box aspect = world-rect aspect. */
async function overlayAspect(page: Page): Promise<number> {
  const overlay = page.getByTestId("trace-inline-svg")
  await expect(overlay).toBeVisible()
  return overlay.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.height === 0 ? Number.NaN : r.width / r.height
  })
}

test("regression: applied pixelate overlay renders at its frozen apply-time aspect, decoupled from imageTx", async ({
  page,
}) => {
  await bootEditorWithMaster(page)

  // 1. Resize the base image to a clear portrait (≈ 0.53) — the live
  //    imageTx aspect, deliberately != the frozen 2:1 trace rect.
  await resizeImage(page, RESIZE_1_W_CM, RESIZE_1_H_CM)

  // 2. Apply pixelate → the mock freezes a 2:1 display rect + near-square SVG.
  await applyPixelate(page)

  // 3. Assert C-1: overlay aspect is the FROZEN rect (2:1), not the live
  //    imageTx (≈ 0.53 portrait) and not the SVG viewBox (≈ 1.03).
  //    Pre-fix this read 0.5333 (the imageTx aspect leaked); post-fix 2.0.
  const aspect1 = await overlayAspect(page)
  expect(
    aspect1,
    `overlay aspect ${aspect1.toFixed(3)} should be the frozen 2:1 rect, not the portrait imageTx (~0.53) or the near-square SVG viewBox (~1.03)`,
  ).toBeGreaterThan(FROZEN_ASPECT - 0.15)
  expect(aspect1).toBeLessThan(FROZEN_ASPECT + 0.15)

  // 4. Assert C-2: resize the base image AGAIN (to a square) — the overlay
  //    must keep its frozen 2:1 aspect (only the SIZE is frozen on display_*;
  //    the position follows the image, but that can't change the aspect). The
  //    resize happens on the Image tab; switch back to Trace to re-measure.
  //    This is the part SIZE-coupling to `imageTx` can't pass: a square
  //    imageTx would drag the overlay aspect toward 1.0.
  await resizeImage(page, "10", "10")
  await page.getByRole("tab", { name: "Trace" }).click()
  const aspect2 = await overlayAspect(page)
  expect(
    aspect2,
    `overlay aspect ${aspect2.toFixed(3)} must stay frozen at 2:1 after the base image is resized to a square; it followed imageTx if it drifted toward 1.0`,
  ).toBeGreaterThan(FROZEN_ASPECT - 0.15)
  expect(aspect2).toBeLessThan(FROZEN_ASPECT + 0.15)
})
