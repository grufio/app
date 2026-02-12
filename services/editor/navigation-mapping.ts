/**
 * Editor service: navigation mapping (UI-agnostic).
 *
 * Responsibilities:
 * - Map stable internal node names to user-facing labels and icon keys.
 * - Keep these product rules out of React components.
 */
export type SidebarNodeIconKey = "artboard" | "image" | "folder"

export function mapSidebarNodeLabel(name: string): string {
  return name === "app" ? "Artboard" : name === "api" ? "Image" : name
}

export function mapSidebarNodeIconKey(name: string): SidebarNodeIconKey {
  return name === "app" ? "artboard" : name === "api" ? "image" : "folder"
}

