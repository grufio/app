/**
 * Editor display-layers — single source of truth for "what renders on
 * the canvas" right now.
 *
 * Subsumes the legacy `computeTraceOverlay` (load-bearing invariant
 * established by PR series #76 → #82 → #83 → #84 → #86) and the
 * `canvasMode` derivation that lived inline in
 * `ProjectEditorShell.client.tsx`.
 *
 * The load-bearing invariants:
 *
 *  1. Filter operates on raster. The raster filter chain tip
 *     (`filterDisplayImageWithoutTrace`) is the Konva.Image source.
 *     Filter never reads from the trace SVG.
 *
 *  2. Trace is a transparent overlay above the raster filter tip. The
 *     trace SVG mounts in inline DOM above Konva, not as a replacement
 *     Konva.Image. Underlying filter colors must show through.
 *
 *  3. Layer surfacing is **section-gated** — identically on both
 *     viewports. The single `activeSection` input (the shell's
 *     `editorSection`: "artboard" / "image" / "filter" / "trace" /
 *     "colors") names the active surface. Only "filter" and "trace"
 *     surface extra layers; "artboard" and "image" show neither.
 *
 *     - Filter section → `showFilterChain` true (Filter sidebar
 *       row-highlight switches on; canvas image source itself is
 *       always the working copy, so the visible image is the same
 *       in any section, but the filter UI accents differ).
 *     - Trace section → `traceOverlaySvgUrl` returns the URL when a
 *       real trace artefact exists.
 *     - Artboard / Image section → no filter chain highlight, no trace
 *       overlay. The user did not ask to see those there.
 *
 *  5. **Trace view flags are Trace-section-scoped.** The three Trace
 *     visibility toggles (`traceOverlayVisible`, `previewBitmapVisible`,
 *     `numbersLayerVisible`) are persisted in session state so the
 *     user's last Trace view preference survives a tab trip. Their
 *     **canvas effect** is gated on the Trace section being active —
 *     outside Trace the effective values collapse to `true`. The
 *     checkbox UI keeps reading the raw session values so a toggle
 *     left off stays off; only the canvas reads the effective value.
 *
 *  4. Data-presence invariants apply to both surfaces:
 *      - Filter chain needs `editorImageSourceReady`.
 *      - Trace overlay needs both display images (with/without trace)
 *        AND their IDs must differ — otherwise no real trace artefact
 *        exists.
 *
 * Codifying this in a pure function lets the integration tests pin the
 * behavior. Do not inline this back into `ProjectEditorShell` without
 * also moving the test file.
 *
 * Output type carries one boolean per logical layer + the trace
 * overlay URL when available. Future Colors / Output layers slot in
 * as additional booleans — consumer code stays a property lookup per
 * layer.
 */
import type { EditorSection } from "@/lib/editor/editor-sections"

export type DisplayImage = {
  id: string
  signedUrl: string
}

export type { EditorSection }

export type DisplayLayers = {
  /** True when the canvas should source from the filter chain tip
   * (`canvasMode === "filter"` in shell terms) instead of the raw
   * master. */
  showFilterChain: boolean
  /** The trace SVG URL when the overlay should surface, else null. */
  traceOverlaySvgUrl: string | null
  /** Effective value of `SessionState.traceOverlayVisible`, gated on
   * the Trace section being active. Outside Trace this is `true`
   * regardless of the session value — the toggles are Trace-only
   * effects. The canvas reads this; the checkbox UI reads the raw
   * session value (so user intent persists across tab trips). */
  traceOverlayVisible: boolean
  /** Effective value of `SessionState.previewBitmapVisible`. Gated
   * the same way — outside Trace the canvas bitmap always renders. */
  previewBitmapVisible: boolean
  /** Effective value of `SessionState.numbersLayerVisible`. Gated
   * the same way. */
  numbersLayerVisible: boolean
}

export function deriveDisplayLayers(input: {
  /** The active editor section (the shell's `editorSection`), driving
   * the canvas gating on both viewports. "artboard"/"image" → no filter
   * chain, no trace overlay. */
  activeSection: EditorSection
  editorImageSourceReady: boolean
  filterDisplayImage: DisplayImage | null | undefined
  filterDisplayImageWithoutTrace: DisplayImage | null | undefined
  /** Raw session value for the Trace cells overlay toggle. Default
   * `true`. Off-Trace, the effective value collapses to `true`
   * regardless. */
  traceOverlayVisible?: boolean
  /** Raw session value for the preview bitmap toggle. Default `true`.
   * This is the flag that actually leaked pre-fix: gating
   * `<KonvaImage>` regardless of tab. */
  previewBitmapVisible?: boolean
  /** Raw session value for the labels layer toggle. Default `true`. */
  numbersLayerVisible?: boolean
}): DisplayLayers {
  const {
    activeSection,
    editorImageSourceReady,
    filterDisplayImage,
    filterDisplayImageWithoutTrace,
    traceOverlayVisible = true,
    previewBitmapVisible = true,
    numbersLayerVisible = true,
  } = input

  // Section gating — one input drives both viewports.
  const filterSectionActive = activeSection === "filter"
  const traceSectionActive = activeSection === "trace"

  // Filter chain — section + image-ready gate.
  const showFilterChain = filterSectionActive && editorImageSourceReady

  // Trace overlay — section + data-presence (both images present, IDs
  // differ = real artefact exists).
  let traceOverlaySvgUrl: string | null = null
  if (
    traceSectionActive &&
    filterDisplayImage &&
    filterDisplayImageWithoutTrace &&
    filterDisplayImage.id !== filterDisplayImageWithoutTrace.id
  ) {
    traceOverlaySvgUrl = filterDisplayImage.signedUrl
  }

  // Trace view flags — section-scoped effect. Reuse `traceSectionActive`
  // so the three view gates can't drift from the `traceOverlaySvgUrl`
  // gate above. Outside Trace, all three collapse to `true` — the
  // toggles control the user's *view of Trace*, not other tabs.
  return {
    showFilterChain,
    traceOverlaySvgUrl,
    traceOverlayVisible: traceSectionActive ? traceOverlayVisible : true,
    previewBitmapVisible: traceSectionActive ? previewBitmapVisible : true,
    numbersLayerVisible: traceSectionActive ? numbersLayerVisible : true,
  }
}
