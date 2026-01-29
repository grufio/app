/**
 * Editor feature components entrypoint.
 *
 * Responsibilities:
 * - Export editor components that are safe to consume across the app boundary.
 * - Keep deep-imports out of `app/**` and other features.
 *
 * Note:
 * - `canvas-stage/*` modules are implementation details (not exported).
 */
export * from "./project-editor-header"
export * from "./editor-error-boundary"

export * from "./floating-toolbar"
export * from "./canvas-tool-sidebar"

export * from "./layers-menu"

export * from "./artboard-panel"
export * from "./grid-panel"
export * from "./image-panel"

export * from "./panel-layout"
export * from "./sidebar/editor-sidebar-section"
export * from "./fields/icon-color-field"
export * from "./fields/icon-input-group"
export * from "./fields/icon-numeric-field"
export * from "./fields/icon-select-field"

// Types only: avoid exporting Konva-heavy canvas stage into non-editor bundles.
export type { ProjectCanvasStageHandle } from "./project-canvas-stage"

