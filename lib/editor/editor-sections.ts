/**
 * Mobile editor sections — single source of truth.
 *
 * The section names that drive the mobile bottom-nav, the shell's
 * `editorSection` state, and `deriveDisplayLayers`' section-gating
 * live here as a `const` tuple, in pipeline order
 * (Image → Filter → Trace → Color). Importing the type from one place
 * keeps the consumers from drifting (adding a new section is a one-edit
 * affair). Note: the section literal `"image"` is unrelated to the
 * selection nav-id `kind: "image"` (see
 * `features/editor/navigation/nav-id.ts`) — different axes. The former
 * standalone "artboard" section was folded into "image": the image
 * dialog now carries the artboard/page settings too.
 */
export const EDITOR_SECTIONS = ["image", "filter", "trace", "colors"] as const

export type EditorSection = (typeof EDITOR_SECTIONS)[number]

/**
 * The dialog the image section's top bar can open. The pencil launches a
 * single sheet that merges the master-image placement with the
 * artboard/page settings. Co-located with `EditorSection` so the image
 * open-channel has a single source of truth across the shell state, the
 * surface scope, and the top bar. (Grid keeps its `"grid"` sheet as code
 * but is no longer a reachable nav entry.)
 */
export type ArtboardDialog = "image"
