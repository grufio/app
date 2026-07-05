"use client"

/**
 * Tone (dark | light) for the floating canvas bars — the home / view bars
 * (`EditorHomeBar`, `EditorViewBar` which hosts the theme toggle + Eye), the
 * top-centre section stepper (`EditorSectionStepper`), the funcs bar
 * (`EditorFuncsBar`) and the tools bar (`EditorToolsBar`).
 *
 * The shell holds the tone as a manual session setting (default `"dark"`,
 * flipped by the theme toggle in `EditorViewBar`) and provides it here so the bar
 * primitives (`ToolbarIconButton`, the pill/circle helpers) read it from
 * context instead of threading a `tone` prop through every surface scope
 * and the canvas stage. Default `"dark"` (no provider) keeps every
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
