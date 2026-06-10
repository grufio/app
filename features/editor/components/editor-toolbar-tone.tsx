"use client"

/**
 * Tone (dark | light) for the floating canvas bars — Home + section bar
 * (`EditorTopLeftBar`), the Edit/Eye bar (`MobileTopRightBar`) and the
 * bottom canvas toolbar (`FloatingToolbar`).
 *
 * The shell derives the tone from the displayed image's brightness (see
 * `use-image-luminance` + `use-toolbar-tone`) and provides it here so the
 * bar primitives (`ToolbarIconButton`, the pill/circle helpers) read it
 * from context instead of threading a `tone` prop through every surface
 * scope and the canvas stage. Default `"dark"` (no provider) keeps every
 * non-editor caller of `ToolbarIconButton` unchanged.
 */
import { createContext, useContext, type ReactNode } from "react"

export type ToolbarTone = "dark" | "light"

const EditorToolbarToneContext = createContext<ToolbarTone>("dark")

export function EditorToolbarToneProvider({
  tone,
  children,
}: {
  tone: ToolbarTone
  children: ReactNode
}) {
  return (
    <EditorToolbarToneContext.Provider value={tone}>{children}</EditorToolbarToneContext.Provider>
  )
}

export function useEditorToolbarTone(): ToolbarTone {
  return useContext(EditorToolbarToneContext)
}
