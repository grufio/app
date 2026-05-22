/**
 * Pixelate aspect regression gate (WS-2 from
 * output/review/architect_pixelate-aspect.md).
 *
 * The bug class this guards against: the Pixelate trace dialog showed
 * the *initial / master* image size + aspect instead of the size the
 * user set via the right-panel resize. It survived ~20 PRs because no
 * runtime gate exercised "resize → open Pixelate → read the dialog".
 *
 * What this spec asserts (post-#268 happy path):
 *   The user resizes the image on the artboard, then opens the Pixelate
 *   dialog. The dialog header `Image: W × H mm` and the live preview
 *   aspect must reflect the RESIZE, not the 2:1 master intrinsic.
 *
 * Flow (exactly the user's path):
 *   1. Load editor with a 20×10 master (intrinsic aspect 2:1) on a
 *      20cm × 30cm workspace; wait for the Konva image to mount.
 *   2. Right panel → Image section → set width 8cm / height 15cm
 *      (aspect-lock OFF by default). This is a clear PORTRAIT, the
 *      inverse of the 2:1 landscape master — so a leaked master size
 *      is unmistakable.
 *   3. Trace tab → "Add trace" → "Pixelate" → "Select".
 *   4. Assert A: dialog header reads `Image: 80.0 × 150.0 mm`
 *      (NOT a landscape master readout).
 *   5. Assert B: the live preview canvas (`pixelate-preview-mini`)
 *      CSS `aspect-ratio` is the cropped-grid aspect derived from the
 *      resize (`usedMmW / usedMmH` = 78/144 ≈ 0.54, portrait) — NOT the
 *      2:1 landscape master (≈ 2.0).
 *
 * Why `aspect-ratio` and not `getBoundingClientRect`: the preview pane
 * is a FIXED SQUARE (`aspectRatio: 1/1`) and the canvas fills it with
 * `width: 100%` + `maxHeight: 100%`, so the box rect is always ~1:1
 * regardless of the image. The load-bearing display signal — the value
 * `resolvePixelateGrid(displayMm…)` actually computes from the resize —
 * is the canvas's CSS `aspect-ratio` (`pixelate-preview-pane.tsx:97-99,
 * 130`). A leaked master size would make it land near `2 / 1`.
 *
 * Honest scope (also stated in the PR): the mock cannot reproduce the
 * underlying cache-miss `masterRowId`-flip — the real route always
 * emits `masterRowId` now (#268), and the mock mirrors that contract.
 * Assert C (post-apply overlay aspect) is NOT covered: the trace POST
 * mock returns `{ ok: true }` with no SVG, so no `TraceInlineSvg`
 * overlay renders. This gate is the permanent regression fence for the
 * resize → dialog size/aspect contract.
 */
import { expect, test } from "@playwright/test"

import { PROJECT_ID, setupMockRoutes } from "./_mocks"

// Resize target (workspace unit is cm). 8×15 cm is a portrait, the
// inverse of the 2:1 landscape master. At GEOMETRY_PPI=72 the cm→µpx→mm
// round-trip is exact to one decimal:
//   8 cm  → 80.0 mm    15 cm → 150.0 mm
const RESIZE_W_CM = "8"
const RESIZE_H_CM = "15"
const EXPECTED_HEADER = "Image: 80.0 × 150.0 mm"

// Default supercell is 6 mm. Grid over the 80×150 mm display:
//   cellsX = floor(80/6)  = 13 → usedMmW = 13*6 = 78
//   cellsY = floor(150/6) = 24 → usedMmH = 24*6 = 144
// (cellsY is 24, not 25: 150/6 = 25 exactly, but float division of the
//  round-tripped display mm lands a hair under 25 → floor = 24.)
// → preview canvas CSS aspect-ratio = usedMmW / usedMmH = 78/144 ≈ 0.54.
const EXPECTED_USED_W = 78
const EXPECTED_USED_H = 144
const EXPECTED_ASPECT = EXPECTED_USED_W / EXPECTED_USED_H // ≈ 0.5417

async function bootEditorWithMaster(page: import("@playwright/test").Page) {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })
  await page.goto(`/projects/${PROJECT_ID}`)

  // Canvas root + Konva image node both present = the canvas has loaded
  // the image and is reporting its transform into the mirror.
  await expect(page.getByTestId("editor-canvas-root")).toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Boolean((globalThis as { __gruf_editor?: { image?: unknown } }).__gruf_editor?.image),
      ),
    )
    .toBe(true)
}

async function resizeImage(page: import("@playwright/test").Page) {
  // Switch the layer tree to the Image node so the right panel shows the
  // size fields. Same locator strategy as forms.visual.spec.ts.
  const layers = page.getByRole("complementary", { name: "Layers" })
  await expect(layers).toBeVisible()
  await layers.getByRole("button", { name: "Image", exact: true }).first().click()

  const w = page.getByLabel(/Image width/i)
  const h = page.getByLabel(/Image height/i)
  await expect(w).toBeVisible()
  await expect(w).toBeEnabled()
  await expect(h).toBeEnabled()

  await w.fill(RESIZE_W_CM)
  await h.fill(RESIZE_H_CM)
  await h.press("Enter")

  // The readout reflects the committed resize (sanity that the canvas
  // accepted it before we open the dialog).
  await expect(w).toHaveValue(RESIZE_W_CM)
  await expect(h).toHaveValue(RESIZE_H_CM)
}

async function openPixelateDialog(page: import("@playwright/test").Page) {
  await page.getByRole("tab", { name: "Trace" }).click()
  await page.getByRole("button", { name: "Add trace" }).click()
  // The trace card label comes from TRACE_REGISTRY (pixelate.label = "Pixelate").
  await page.getByRole("button", { name: "Pixelate", exact: true }).click()
  await page.getByRole("button", { name: "Select", exact: true }).click()
}

test("regression: pixelate dialog shows the resized image size + aspect, not the master", async ({
  page,
}) => {
  await bootEditorWithMaster(page)
  await resizeImage(page)
  await openPixelateDialog(page)

  // The Pixelate dialog's accessible name is the sr-only DialogTitle "Pixelate".
  const dialog = page.getByRole("dialog", { name: "Pixelate" })
  await expect(dialog).toBeVisible()

  // ── Assert A: header size readout reflects the resize, not the master ──
  await expect(dialog.getByText(EXPECTED_HEADER)).toBeVisible()

  // ── Assert B: live preview canvas aspect reflects the resize (portrait) ──
  const preview = page.getByTestId("pixelate-preview-mini")
  await expect(preview).toBeVisible()

  // Read the CSS `aspect-ratio` the component sets from the resolved grid
  // (`usedMmW / usedMmH`). The computed value is normalised to `"W / H"`.
  const aspect = await preview.evaluate((el) => {
    const raw = getComputedStyle(el).aspectRatio // e.g. "78 / 144"
    const m = raw.match(/([\d.]+)\s*\/\s*([\d.]+)/)
    if (!m) return Number.NaN
    return Number(m[1]) / Number(m[2])
  })
  expect(Number.isFinite(aspect), `expected a numeric aspect-ratio, got NaN`).toBe(true)

  // The 2:1 landscape master would yield aspect ≈ 2.0. The resize is a
  // portrait, so the aspect must be clearly < 1 — a leaked master fails here.
  expect(
    aspect,
    `preview aspect ${aspect.toFixed(3)} should be portrait (< 1); a value near 2.0 means the master aspect leaked`,
  ).toBeLessThan(1)

  // And it should equal the cropped grid aspect (78/144 ≈ 0.54), within a
  // tolerance that absorbs grid-rounding but not a wrong source.
  expect(aspect).toBeGreaterThan(EXPECTED_ASPECT - 0.05)
  expect(aspect).toBeLessThan(EXPECTED_ASPECT + 0.05)
})
