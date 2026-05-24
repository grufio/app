/**
 * The display-size PIXEL render gate (the gate that was missing for ~120
 * PRs — arch_trace_layer_root).
 *
 * User-verified root symptom (prod project 2d15eeeb…): the user sets the
 * image display size to 283×567 px on a master/source bitmap that is
 * 1254×1254 px. The image on the canvas AND the applied Pixelate trace
 * render at the SOURCE-BITMAP pixels (1254-derived), NOT at the set
 * display pixels (283×567). The trace "renders inside the div of the
 * source image, so it can never get its own size" (user, verbatim sense).
 *
 * Measured root cause: the canvas reported its SYSTEM intrinsic placement
 * up through `onImageTransformChange` → `useDisplaySize.handleImageTransform
 * Change`, overwriting the persisted/re-seeded display size (`displayTxU`)
 * with the source-bitmap intrinsic — the corruption loop that
 * `use-display-size.ts`'s Invariant 1 says must be impossible ("system /
 * re-placement never feed this"). The image layer then rendered at the
 * intrinsic, and the trace overlay (whose legacy fallback follows
 * `imageRender`, and whose dialog size reads the same `displayTxU`) inherited
 * it. The fix gates `onImageTransformChange` so only real user-edit commits
 * (`hasUserChanged()`) feed the source; system placements do not.
 *
 * Why the existing `trace-overlay-aspect.spec.ts` did NOT catch this: it
 * asserts the overlay's ASPECT (a ratio survives any uniform scale, so a
 * wrong absolute size with the right proportion passes), and it RESIZES the
 * image first (driving `displayTxU` via the user-edit path), so it never
 * exercised the persisted-state-seed path that the corruption hit. The user
 * works in PIXELS, not ratios — this spec measures ABSOLUTE rendered pixels.
 *
 * Two gates:
 *  1. PERSISTED-STATE BOOT (the reported symptom): boot with the persisted
 *     display size (283×567) served as the project's image-state — the
 *     faithful equivalent of the prod SSR seed (E2E mock-mode has no SSR;
 *     `useDisplaySize` re-seeds from GET /image-state on the initial master
 *     load). The Konva image node must render at the persisted display
 *     size, NOT the source-bitmap intrinsic. Pre-fix the intrinsic placement
 *     report clobbered `displayTxU` → 1254×1254.
 *  2. TRACE-LAYER PIXELS: after a user resize + Pixelate apply, the trace
 *     overlay container must render at the frozen display pixels, decoupled
 *     from the source bitmap.
 */
import { expect, test, type Page } from "@playwright/test"

import { PROJECT_ID, setupMockRoutes } from "./_mocks"

// The prod source bitmap (master/working_copy intrinsic). Far larger than
// the set display size, so "render at display px" vs "render at source px"
// is unmistakable.
const MASTER_W = 1254
const MASTER_H = 1254

// The user-set display size in px (prod: 283.46×566.93; integers here —
// the bug is display≈283×567 vs intrinsic 1254×1254, the fractional part is
// irrelevant to the assertion).
const DISPLAY_W = 283
const DISPLAY_H = 567

// µpx encoding helper (1px = 1e6 µpx).
const PX_U = (px: number) => String(px * 1_000_000)

// Pixel tolerance for measured world size (sub-pixel rounding + the
// integer-vs-fractional display size). Far tighter than the 1254-vs-283 gap
// (≈970 px / ≈690 px) it must separate.
const TOL_PX = 8

/** Current uniform stage scale (scaleX == scaleY). */
async function stageScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const stage = (globalThis as { __gruf_editor?: { stage?: { scaleX(): number } } }).__gruf_editor?.stage
    return stage ? stage.scaleX() : Number.NaN
  })
}

/** Rendered IMAGE-LAYER (Konva image node) size in WORLD px. The node's
 * width()/height() are already world units (set from `imageRender`). */
async function imageLayerWorldSize(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => {
    const node = (globalThis as { __gruf_editor?: { image?: { width(): number; height(): number } } }).__gruf_editor?.image
    if (!node) return { w: Number.NaN, h: Number.NaN }
    return { w: node.width(), h: node.height() }
  })
}

/** Rendered TRACE-LAYER size in WORLD px (DOM box ÷ stage scale). */
async function traceLayerWorldSize(page: Page): Promise<{ w: number; h: number }> {
  const overlay = page.getByTestId("trace-inline-svg")
  await expect(overlay).toBeVisible()
  const box = await overlay.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  const scale = await stageScale(page)
  return { w: box.w / scale, h: box.h / scale }
}

async function waitForImageNode(page: Page) {
  await expect(page.getByTestId("editor-canvas-root")).toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(() => Boolean((globalThis as { __gruf_editor?: { image?: unknown } }).__gruf_editor?.image)),
    )
    .toBe(true)
}

async function resizeImageToDisplaySize(page: Page) {
  await page.getByRole("tab", { name: "Image" }).click()
  const layers = page.getByRole("complementary", { name: "Layers" })
  await expect(layers).toBeVisible()
  await layers.getByRole("button", { name: "Image", exact: true }).first().click()
  const w = page.getByLabel(/Image width/i)
  const h = page.getByLabel(/Image height/i)
  await expect(w).toBeEnabled()
  await expect(h).toBeEnabled()
  await w.fill(String(DISPLAY_W))
  await h.fill(String(DISPLAY_H))
  await h.press("Enter")
  await expect(w).toHaveValue(String(DISPLAY_W))
  await expect(h).toHaveValue(String(DISPLAY_H))
}

async function applyPixelate(page: Page) {
  await page.getByRole("tab", { name: "Trace" }).click()
  await page.getByRole("button", { name: "Add trace" }).click()
  await page.getByRole("button", { name: "Pixelate", exact: true }).click()
  await page.getByRole("button", { name: "Select", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Pixelate" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: /^Apply/ }).click()
}

test("image layer renders at the PERSISTED display size on boot, not the source-bitmap pixels", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, {
    withImage: true,
    workspace: { unit: "px", width_value: 595, height_value: 842 },
    // Source bitmap is 1254×1254 (prod master/working_copy intrinsic).
    masterDims: { width_px: MASTER_W, height_px: MASTER_H },
    // The persisted display transform (283×567) — faithful equivalent of
    // the prod SSR seed. `useDisplaySize` re-seeds from GET /image-state on
    // the initial master load (E2E mock-mode has no SSR).
    imageState: {
      exists: true,
      state: {
        x_px_u: PX_U(297),
        y_px_u: PX_U(421),
        width_px_u: PX_U(DISPLAY_W),
        height_px_u: PX_U(DISPLAY_H),
        rotation_deg: 0,
      },
    },
  })
  await page.goto(`/projects/${PROJECT_ID}`)
  await waitForImageNode(page)

  // The persisted size must reach the canvas layer. Pre-fix the system
  // intrinsic placement reported up and clobbered `displayTxU` → the node
  // rendered at the source bitmap (1254×1254). Settle, then assert.
  await expect
    .poll(async () => Math.round((await imageLayerWorldSize(page)).w), {
      timeout: 5000,
      intervals: [100, 200, 300, 500],
    })
    .toBe(DISPLAY_W)

  const image = await imageLayerWorldSize(page)
  expect(
    Math.abs(image.w - DISPLAY_W),
    `image-layer world width ${image.w.toFixed(1)} must equal the persisted display ${DISPLAY_W}px (not the source bitmap ${MASTER_W}px)`,
  ).toBeLessThanOrEqual(TOL_PX)
  expect(
    Math.abs(image.h - DISPLAY_H),
    `image-layer world height ${image.h.toFixed(1)} must equal the persisted display ${DISPLAY_H}px (not the source bitmap ${MASTER_H}px)`,
  ).toBeLessThanOrEqual(TOL_PX)
  // Explicitly NOT the source-bitmap intrinsic.
  expect(
    Math.abs(image.w - MASTER_W),
    `image-layer world width ${image.w.toFixed(1)} must NOT be the source-bitmap ${MASTER_W}px`,
  ).toBeGreaterThan(TOL_PX)
})

test("trace layer renders at the SET display pixels, not the source-bitmap pixels", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, {
    withImage: true,
    workspace: { unit: "px", width_value: 595, height_value: 842 },
    masterDims: { width_px: MASTER_W, height_px: MASTER_H },
    traceDisplayRectPxU: {
      display_x_px_u: "0",
      display_y_px_u: "0",
      display_width_px_u: PX_U(DISPLAY_W),
      display_height_px_u: PX_U(DISPLAY_H),
    },
  })
  await page.goto(`/projects/${PROJECT_ID}`)
  await waitForImageNode(page)

  // The user resizes to the display size (the act that wrote the prod row),
  // then applies Pixelate. The mock freezes the trace display rect to
  // 283×567 (what the prod server writes from project_image_state).
  await resizeImageToDisplaySize(page)
  await applyPixelate(page)

  const trace = await traceLayerWorldSize(page)
  const image = await imageLayerWorldSize(page)

  // The image layer reflects the set display size after the resize.
  expect(Math.abs(image.w - DISPLAY_W)).toBeLessThanOrEqual(TOL_PX)
  expect(Math.abs(image.h - DISPLAY_H)).toBeLessThanOrEqual(TOL_PX)

  // CORE: the trace layer renders at the SET display pixels, decoupled from
  // the source bitmap (283×567, not 1254×1254).
  expect(
    Math.abs(trace.w - DISPLAY_W),
    `trace-layer world width ${trace.w.toFixed(1)} must equal the set display ${DISPLAY_W}px (not the source bitmap ${MASTER_W}px)`,
  ).toBeLessThanOrEqual(TOL_PX)
  expect(
    Math.abs(trace.h - DISPLAY_H),
    `trace-layer world height ${trace.h.toFixed(1)} must equal the set display ${DISPLAY_H}px (not the source bitmap ${MASTER_H}px)`,
  ).toBeLessThanOrEqual(TOL_PX)
  // And explicitly NOT the source-bitmap intrinsic on either axis.
  expect(
    Math.abs(trace.w - MASTER_W),
    `trace-layer world width ${trace.w.toFixed(1)} must NOT be the source-bitmap ${MASTER_W}px`,
  ).toBeGreaterThan(TOL_PX)
  expect(
    Math.abs(trace.h - MASTER_H),
    `trace-layer world height ${trace.h.toFixed(1)} must NOT be the source-bitmap ${MASTER_H}px`,
  ).toBeGreaterThan(TOL_PX)
})
