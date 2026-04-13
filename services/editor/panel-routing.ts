/**
 * Editor panel routing (UI-agnostic decision helpers).
 *
 * Responsibilities:
 * - Map navigation selection IDs to the right panel section.
 * - Keep the “why” out of React components to avoid copy/paste drift as the editor grows.
 */
import { parseNavId } from "@/lib/editor/navigation/nav-id"
import { resolveRightSectionFromNavKind, type EditorRightPanelSection } from "@/services/editor/section-registry"

export function mapSelectedNavIdToRightPanelSection(selectedNavId: string): EditorRightPanelSection {
  const selection = parseNavId(selectedNavId)
  return resolveRightSectionFromNavKind(selection.kind)
}

