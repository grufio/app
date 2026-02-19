/**
 * Editor panel routing (UI-agnostic decision helpers).
 *
 * Responsibilities:
 * - Map navigation selection IDs to the right panel section.
 * - Keep the “why” out of React components to avoid copy/paste drift as the editor grows.
 */
import { parseNavId } from "@/features/editor/navigation/nav-id"

export type EditorRightPanelSection = "artboard" | "image" | "grid"

export function mapSelectedNavIdToRightPanelSection(selectedNavId: string): EditorRightPanelSection {
  const selection = parseNavId(selectedNavId)
  if (selection.kind === "grid") return "grid"
  return selection.kind === "image" || selection.kind === "imagesFolder" ? "image" : "artboard"
}

