/**
 * Mobile editor sections — single source of truth.
 *
 * The section names that drive the mobile bottom-nav, the shell's
 * `editorSection` state, and `deriveDisplayLayers`' section-gating
 * live here as a `const` tuple, in pipeline order
 * (Artboard → Image → Filter → Trace → Color). Importing the type
 * from one place keeps the consumers from drifting (adding a new
 * section is a one-edit affair). Note: the section literal `"image"`
 * is unrelated to the selection nav-id `kind: "image"` (see
 * `features/editor/navigation/nav-id.ts`) — different axes.
 */
export const EDITOR_SECTIONS = ["artboard", "image", "filter", "trace", "colors"] as const

export type EditorSection = (typeof EDITOR_SECTIONS)[number]

/**
 * The three standalone dialogs the artboard section's top-left "+" menu
 * can open. Each frame (Artboard/Page, Grid, Image) launches its own
 * single-purpose sheet instead of one combined sheet. Co-located with
 * `EditorSection` so the artboard open-channel has a single source of
 * truth across the shell state, the surface scope, and the top-left bar.
 */
export type ArtboardDialog = "artboard" | "grid" | "image"
