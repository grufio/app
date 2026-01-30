/**
 * Editor panel routing (UI-agnostic decision helpers).
 *
 * Responsibilities:
 * - Map navigation selection IDs to the right panel section.
 * - Keep the “why” out of React components to avoid copy/paste drift as the editor grows.
 */

export type EditorRightPanelSection = "artboard" | "image"

export function mapSelectedNavIdToRightPanelSection(selectedNavId: string): EditorRightPanelSection {
  // Current MVP rule: API subtree drives image-related actions.
  return selectedNavId.startsWith("app/api") ? "image" : "artboard"
}

