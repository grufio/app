/**
 * Editor feature public entrypoint.
 *
 * Responsibilities:
 * - Provide stable exports for editor UI wiring (feature boundary).
 * - Allow `app/` routes to import editor UI without deep component paths.
 *
 * Notes:
 * - Implementation is migrated incrementally; avoid importing from `services/` here unless needed.
 */
export * from "./components/ProjectEditorLayout"
export * from "./components/ProjectEditorLeftPanel"
export * from "./components/ProjectEditorRightPanel"
export * from "./components/ProjectEditorStage"
export * from "./components"

